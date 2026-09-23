/**
 * Analytics Service
 * Alertas com detalhes completos dos usuários afetados.
 */

// Status que indicam apontamento em aberto — usado em alertas e filtros
const OPEN_STATUSES = ['aberto','open','pendente','pending','em andamento','in progress','novo','new','aguardando'];

// Agrupa items por campo — ordem decrescente de contagem. Compartilhado entre
// apontamentos (byType/byStatus/byOrigin) e a amostra "por tipo" de inventário.
function groupByField(items, key, fallback = 'Não informado') {
  const m = {};
  items.forEach(i => { const k = i[key] || fallback; m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

// Dias desde o apontamento mais recente — mesma lógica usada no healthProxy do
// agente (backend/routes/agent.js), centralizada aqui para reuso no resumo executivo.
function diasDesdeUltimoReporting(recent) {
  const data = recent?.[0]?.foundAt || recent?.[0]?.createdAt;
  if (!data) return { data: null, dias: null };
  // Kartado tem apontamentos com data futura na base (erro de digitação/sistema
  // de origem) — sem o clamp, isso vira "há -37d", confuso para quem lê o resumo.
  const dias = Math.max(0, Math.floor((Date.now() - new Date(data)) / 86_400_000));
  return { data: String(data).split('T')[0], dias };
}

// Conta dias úteis (seg-sex) entre duas datas, inclusive. Mesma lógica do
// Painel de Saúde do frontend (UnitHealth.jsx) — centralizada aqui para que
// /dashboard e /resumo-geral (Copilot Studio) usem exatamente o mesmo score
// que o Relatório Gerencial em PDF, em vez de duas fórmulas divergentes.
function businessDaysBetween(start, end) {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d <= last) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Pilares de recência (% dias úteis com apontamento) — mesma fórmula do
// Painel de Saúde. Denominador em dias úteis (não corridos): a operação real
// é 5 dias/semana, então usar dias corridos limitava o teto a ~67-73%, fazendo
// toda concessão parecer "crítica" mesmo operando normalmente.
function calcularPilaresRecencia(mesItems, reportItems, total) {
  if (total === 0) {
    return { dimDiasUso: 0, pct15Dias: 0, diasUsados: 0, diasUteisDecorridos: 0, dias15Usados: 0, diasUteisJanela: 0 };
  }

  const now = new Date();
  const mesAtual  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
  const diasUteisDecorridos = businessDaysBetween(inicioMes, now);

  const baseItems = mesItems.length > 0 ? mesItems : reportItems;
  const diasSet = new Set(
    baseItems.map(i => (i.foundAt || i.createdAt || '').split('T')[0]).filter(d => d.startsWith(mesAtual))
  );
  const diasUsados = diasSet.size;
  // Usa mínimo de 5 dias úteis como denominador para evitar distorção no início do mês
  // (ex: dia 1 com 1 dia útil decorrido faria score 0 para quem não apontou hoje)
  const denominadorDias = Math.max(diasUteisDecorridos, 5);
  const dimDiasUso = Math.min(100, Math.round((diasUsados / denominadorDias) * 100));

  const JANELA_DIAS = 15;
  const quinzeDiasAtrasDate = new Date(now.getTime() - JANELA_DIAS * 86_400_000);
  const quinzeDiasAtras = quinzeDiasAtrasDate.toISOString().split('T')[0];
  const diasUteisJanela = businessDaysBetween(quinzeDiasAtrasDate, now);

  const dias15Set = new Set(
    reportItems.map(i => (i.foundAt || i.createdAt || '').split('T')[0]).filter(d => d >= quinzeDiasAtras)
  );
  const dias15Usados = dias15Set.size;
  const pct15Dias = diasUteisJanela > 0 ? Math.min(100, Math.round((dias15Usados / diasUteisJanela) * 100)) : 0;

  return { dimDiasUso, pct15Dias, diasUsados, diasUteisDecorridos, dias15Usados, diasUteisJanela };
}

// Score de saúde 0-100 — média dos pilares disponíveis: dias de uso, últimos
// 15d, fotos e programações. Mesma fórmula do Painel de Saúde (frontend);
// antes o backend usava uma fórmula simplificada (volume + recência) só para
// o chat livre, divergente do que aparecia no Relatório Gerencial em PDF.
function calcularSaudeScore(total, dimDiasUso, pct15Dias, pctFotosHistorico, dimProgramacoes, hasProgramac) {
  if (total === 0) return 0;
  const vals = [dimDiasUso, pct15Dias];
  if (pctFotosHistorico !== null) vals.push(pctFotosHistorico);
  if (hasProgramac)                vals.push(dimProgramacoes);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function normalizeUser(raw) {
  const a   = raw.attributes || raw;
  const rel = raw.relationships || {};
  const today = new Date().toISOString().split('T')[0];
  const in30  = new Date(); in30.setDate(in30.getDate() + 30);
  const in30s = in30.toISOString().split('T')[0];
  const exp   = a.expirationDate || a.expiration_date || null;

  const risks = [];
  if (!a.email)                            risks.push({ level: 'warning', msg: 'Sem e-mail cadastrado' });
  if (exp && exp < today)                  risks.push({ level: 'danger',  msg: `Expirado em ${exp}` });
  if (exp && exp >= today && exp <= in30s) risks.push({ level: 'info',    msg: `Expira em ${exp}` });

  return {
    id:             raw.id || a.uuid,
    uuid:           a.uuid || raw.id,
    username:       a.username || null,
    fullName:       a.fullName || a.full_name || `${a.firstName || a.first_name || ''} ${a.lastName || a.last_name || ''}`.trim() || '—',
    email:          a.email || null,
    active:         true,
    isSupervisor:   a.isSupervisor ?? a.is_supervisor ?? false,
    isInternal:     a.isInternal   ?? a.is_internal   ?? true,
    expirationDate: exp,
    dateJoined:     a.dateJoined || a.date_joined || null,
    phone:          a.phone || null,
    companyId:      rel.companies?.data?.id || a.company || null,
    risks,
    riskLevel: risks.some(r => r.level === 'danger')  ? 'danger'
             : risks.some(r => r.level === 'warning') ? 'warning'
             : risks.some(r => r.level === 'info')    ? 'info' : 'ok',
  };
}

function normalizeReporting(raw) {
  const a   = raw.attributes || raw;
  const rel = raw.relationships || {};

  // Extrai o ID de um relacionamento JSON:API: relationships.key.data.id
  const relId = key => rel[key]?.data?.id ?? null;

  return {
    id:             raw.id    || a.uuid,
    uuid:           a.uuid    || raw.id,
    number:         a.number          || null,
    link:           a.link            || null,
    roadName:       a.roadName        || a.road_name        || null,
    km:             a.km              ?? null,
    endKm:          a.endKm           ?? a.end_km           ?? null,
    sentido:        a.sentido         || a.direction        || null,
    faixa:          a.faixa           || a.lane             || a.faixa_pista || null,
    natureza:       a.natureza        || a.nature           || null,
    classe:         a.classe          || a.class            || a.classification || null,
    occurrenceType: a.occurrenceType  || a.occurrence_type  || a.natureza || a.nature
                    || relId('occurrenceType') || null,
    occurrenceKind: a.occurrenceKind  || a.occurrence_kind  || null,
    parentKind:     a.parentKind      || a.parent_kind      || null,
    // Campos de identificação — KCOR
    identificacao:  a.identificacao   || a.identification   || a.id_field || a.identifier || null,
    codKcor:        a.codKcor         || a.cod_kcor         || a.kcor_code || a.codigo_kcor || null,
    descricao:      a.descricao       || a.description      || a.desc || null,
    // Campos de contexto — CCO
    faseConcessao:  a.faseConcessao   || a.fase_concessao   || a.fase || a.concession_phase || null,
    dadosGerais:    a.dadosGerais     || a.dados_gerais     || a.category || a.general_data || null,
    // Fluxo e responsáveis — attributes primeiro, depois relacionamentos JSON:API
    status:         a.status          || relId('status')    || null,
    aprovacao:      a.aprovacao       || a.approval         || a.approval_status || null,
    empresa:        a.empresa         || a.company_name     || relId('company')  || null,
    equipe:         a.equipe          || a.team             || relId('firm')     || null,
    companyId:      relId('company')  || a.company          || null,
    prazo:          a.prazo           || a.dueAt            || a.due_at
                    || a.deadline     || a.due_date         || null,
    executedAt:     a.executedAt      || a.executed_at      || null,
    origin:         a.origin || a.origem || null,
    createdAt:      a.createdAt       || a.created_at       || null,
    foundAt:        a.foundAt         || a.found_at         || null,
    updatedAt:      a.updatedAt       || a.updated_at       || null,
    createdBy:      a.createdBy       || a.created_by       || relId('createdBy') || null,
    updatedBy:      a.updatedBy       || a.updated_by       || null,
    imageCount:     (() => {
      // 1. Campos de contagem diretos em attributes
      const v = a.imageCount      ?? a.image_count      ??
                a.imagesCount     ?? a.images_count      ??
                a.photosCount     ?? a.photos_count      ??
                a.mediaCount      ?? a.media_count       ??
                a.attachmentCount ?? a.attachment_count  ??
                a.fileCount       ?? a.file_count        ??
                a.filesCount      ?? a.files_count;
      if (v !== undefined && v !== null) return parseInt(v) || 0;
      // 2. Campos booleanos em attributes
      if (a.hasImages  === true || a.has_images  === true) return 1;
      if (a.hasPhotos  === true || a.has_photos  === true) return 1;
      if (a.hasMedia   === true || a.has_media   === true) return 1;
      // 3. Arrays embutidos em attributes (alguns endpoints retornam lista inline)
      for (const key of ['photos','images','media','attachments','files']) {
        if (Array.isArray(a[key]) && a[key].length > 0) return a[key].length;
      }
      // 4. Relacionamentos JSON:API to-many (relationships.photos.data = [...])
      //    Kartan armazena fotos em /Photo/ separado — o vínculo aparece aqui.
      for (const key of ['photos','images','media','attachments','files']) {
        const data = rel[key]?.data;
        if (Array.isArray(data) && data.length > 0) return data.length;
      }
      return 0;
    })(),
  };
}

// ── Métricas de usuários ──────────────────────────────────────────────────────
export function buildUserMetrics(rawUsers, totalCount) {
  const today = new Date().toISOString().split('T')[0];
  const in30  = new Date(); in30.setDate(in30.getDate() + 30);
  const in30s = in30.toISOString().split('T')[0];

  const users = rawUsers.map(normalizeUser);

  const supervisores  = users.filter(u => u.isSupervisor);
  const internos      = users.filter(u => u.isInternal);
  const terceiros     = users.filter(u => !u.isInternal);

  const expirados = users.filter(u => u.expirationDate && u.expirationDate < today);
  const semEmail = users.filter(u => !u.email);
  const expirando = users.filter(
    u => u.expirationDate && u.expirationDate >= today && u.expirationDate <= in30s,
  );
  const userDetails = list => ({
    label: 'Usuários afetados:',
    usuarios: list.slice(0, 20).map(u => ({
      fullName: u.fullName,
      username: u.username,
      email: u.email,
      expirationDate: u.expirationDate,
    })),
    hasMore: list.length > 20,
  });
  const alertas = [
    expirados.length > 0 && {
      id: 'users-expired', severity: 'danger', count: expirados.length,
      title: `${expirados.length} usuário(s) com acesso expirado`,
      desc: 'Contas ativas na consulta com data de expiração anterior à data atual.',
      action: 'Revisar a necessidade de acesso e renovar ou desativar as contas.',
      details: userDetails(expirados),
    },
    semEmail.length > 0 && {
      id: 'users-without-email', severity: 'warning', count: semEmail.length,
      title: `${semEmail.length} usuário(s) sem e-mail`,
      desc: 'Contas sem endereço de e-mail cadastrado na amostra retornada.',
      action: 'Completar o cadastro dos usuários afetados.',
      details: userDetails(semEmail),
    },
    expirando.length > 0 && {
      id: 'users-expiring', severity: 'info', count: expirando.length,
      title: `${expirando.length} usuário(s) expirando em até 30 dias`,
      desc: 'Acessos próximos da data de expiração.',
      action: 'Validar antecipadamente quais acessos devem ser renovados.',
      details: userDetails(expirando),
    },
  ].filter(Boolean);

  return {
    counts: {
      totalApi:      totalCount,
      returned:      users.length,
      supervisores:  supervisores.length,
      internos:      internos.length,
      terceiros:     terceiros.length,
    },
    alertas,
    users,
    detectedFields: rawUsers[0] ? {
      root:       Object.keys(rawUsers[0]),
      attributes: rawUsers[0].attributes ? Object.keys(rawUsers[0].attributes) : null,
    } : null,
  };
}

// ── Métricas de apontamentos ─────────────────────────────────────────────────
export function buildReportingMetrics(rawReportings, totalCount, reportingError = null, isFirstPage = false) {
  // Erro no endpoint de apontamentos — retorna alerta específico
  if (reportingError) {
    return {
      counts: { totalApi: 0, returned: 0 },
      byStatus: [], byType: [], byRoad: [], recent: [], items: [],
      detectedFields: null,
      alerts: [{
        id: 'reporting-error', severity: 'warning', count: 0,
        title: 'Não foi possível carregar os apontamentos',
        desc:  `A API Kartado retornou erro para este endpoint: ${reportingError}`,
        action: 'Verificar permissão no endpoint /Reporting/Spreadsheet/ junto ao suporte Kartado.',
        details: null,
      }],
    };
  }

  const items = rawReportings.map(normalizeReporting);

  if (!items.length) {
    return {
      counts: { totalApi: totalCount, returned: 0 },
      byStatus: [], byType: [], byRoad: [], recent: [], items: [], detectedFields: null,
      alerts: totalCount > 0 ? [{
        id: 'no-items', severity: 'info', count: totalCount,
        title: `${totalCount} apontamentos na base, nenhum retornado nesta consulta`,
        desc:  'O endpoint respondeu mas não retornou registros na página 1.',
        action: 'Verificar se há filtros ativos ou se os dados estão disponíveis para este período.',
        details: null,
      }] : [],
    };
  }

  const firstItem = rawReportings[0];

  const detectedFields = {
    root:       Object.keys(firstItem),
    attributes: firstItem?.attributes ? Object.keys(firstItem.attributes) : null,
  };

  const grp = key => groupByField(items, key);

  const [byStatus, byType, byRoad, byEquipe, byOrigin] = ['status', 'occurrenceType', 'roadName', 'equipe', 'origin'].map(grp);

  const recent = [...items]
    .sort((a, b) => new Date(b.foundAt || b.createdAt || b.updatedAt || 0) - new Date(a.foundAt || a.createdAt || a.updatedAt || 0))
    .slice(0, 20);

  const openItems  = items.filter(i => OPEN_STATUSES.some(t => (i.status || '').toLowerCase().includes(t)));
  const openCount  = openItems.length;

  const alerts = [
    openCount > 0 && {
      id: 'open', severity: openCount > 100 ? 'warning' : 'info', count: openCount,
      title: `${openCount} apontamento(s) em aberto`,
      desc:  `Ocorrências com status indicativo de pendência (${[...new Set(openItems.map(i => i.status).filter(Boolean))].slice(0,5).join(', ')}).`,
      action: 'Priorizar resolução dos apontamentos mais antigos. Verificar responsáveis por rodovia.',
      details: {
        label:      'Apontamentos em aberto mais recentes:',
        porRodovia: byRoad.slice(0,5),
        porTipo:    byType.slice(0,5),
        recentes:   openItems
          .sort((a, b) => new Date(a.foundAt || a.createdAt || 0) - new Date(b.foundAt || b.createdAt || 0))
          .slice(0, 5)
          .map(i => ({ number: i.number, roadName: i.roadName, km: i.km, occurrenceType: i.occurrenceType, status: i.status, foundAt: i.foundAt })),
      },
    },
    totalCount > items.length && {
      id: 'partial', severity: 'info', count: totalCount,
      title: isFirstPage
        ? `${totalCount.toLocaleString('pt-BR')} apontamentos na base — exibindo os 100 mais recentes`
        : `Exibindo ${items.length} de ${totalCount.toLocaleString('pt-BR')} apontamentos`,
      desc: isFirstPage
        ? 'O dashboard exibe uma amostra para não sobrecarregar a API. Use o filtro de data para consultar um período específico.'
        : `Restam ${(totalCount - items.length).toLocaleString('pt-BR')} apontamentos não carregados.`,
      action: 'Use os filtros "Encontrado de / até" na aba Apontamentos para consultar períodos específicos.',
      details: null,
    },
  ].filter(Boolean);

  // % de apontamentos com foto na amostra retornada (imageCount já vem no payload)
  const comFotoNaAmostra  = items.filter(i => (i.imageCount ?? 0) > 0).length;
  const pctComFotoNaAmostra = items.length > 0
    ? Math.round((comFotoNaAmostra / items.length) * 100) : null;

  return {
    counts: { totalApi: totalCount, returned: items.length },
    byStatus, byType, byRoad, byEquipe, byOrigin, recent, alerts, detectedFields, items,
    comFotoNaAmostra, pctComFotoNaAmostra,
  };
}

// ── Dashboard por concessão ──────────────────────────────────────────────────
// photos15dData: resultado de listPhotosForCompany (fonte primária para pilar "c/ Foto")
export function buildConcessaoDashboard(company, usersData, reportingsData, inventoryData = null, jobData = null, firmData = null, reportingsMonthData = null, photos15dData = null) {
  const users      = buildUserMetrics(usersData.users || [], usersData.totalCount || 0);
  const reportings = buildReportingMetrics(
    reportingsData.reportings || [],
    reportingsData.totalCount || 0,
    reportingsData.error || null,
    reportingsData.isFirstPage || false
  );
  const allAlerts = [...users.alertas, ...reportings.alerts];
  const ultimoApontamento = diasDesdeUltimoReporting(reportings.recent);
  const apontamentosTotal = reportingsData.totalCount || reportingsData.page1Count || reportings.counts.returned;
  const alertasCriticos   = allAlerts.filter(a => a.severity === 'danger').length;

  // Itens do mês corrente — contagem precisa de dias de uso
  const mesItems = (reportingsMonthData?.reportings || []).map(normalizeReporting);

  // Fotos 15d — via /Photo/ endpoint (fonte definitiva)
  // reportingUuids: UUIDs distintos dos apontamentos que têm pelo menos uma foto
  const photos15d        = photos15dData?.photos         || [];
  const reportingUuids15d = photos15dData?.reportingUuids || [];
  const totalPhotos15d   = photos15dData?.totalPhotos    ?? null;
  const fotoApiError     = photos15dData?.error          ?? null;

  // pctFotosHistorico: apontamentos distintos com foto / total de apontamentos
  const totalReportings = reportingsData?.totalCount || reportings.counts.returned || 0;
  const pctFotosHistorico = reportingUuids15d.length > 0 && totalReportings > 0
    ? Math.round((reportingUuids15d.length / totalReportings) * 100)
    : reportingUuids15d.length === 0 && fotoApiError === null && totalPhotos15d !== null
      ? 0   // confirmado: sem fotos nos últimos 15 dias
      : null; // sem dados (API falhou ou não respondeu)

  // Inventários com foto — itens reais para exibição
  const inventoryItemsWithPhotos = inventoryData?.inventoryItems || [];

  // Score de saúde — mesma fórmula do Painel de Saúde (frontend), agora
  // centralizada aqui para que Copilot Studio e PDF nunca divirjam.
  const pilaresRecencia = calcularPilaresRecencia(mesItems, reportings.items || [], apontamentosTotal);
  const dimProgramacoes = jobData?.dimProgramacoes ?? null;
  const hasProgramac    = dimProgramacoes !== null && (jobData?.totalThisMonth ?? 0) > 0;
  const saudeScore = calcularSaudeScore(
    apontamentosTotal, pilaresRecencia.dimDiasUso, pilaresRecencia.pct15Dias, pctFotosHistorico, dimProgramacoes, hasProgramac
  );

  return {
    company,
    alerts: allAlerts,
    users,
    reportings,
    reportingsMes: { items: mesItems, totalCount: reportingsMonthData?.totalCount ?? mesItems.length },
    // photos15d: fotos dos últimos 15 dias via /Photo/ — contém UUIDs de apontamentos com foto
    photos15d: {
      photos:          photos15d,
      reportingUuids:  reportingUuids15d,
      totalPhotos:     totalPhotos15d,
      totalFetched:    photos15d.length,
      pctComFoto:      pctFotosHistorico,
      error:           fotoApiError,
    },
    inventory: inventoryData ? {
      totalCount:     inventoryData.totalCount     ?? null,
      withImageCount: inventoryData.withImageCount ?? null,
      items:          inventoryItemsWithPhotos,
      // byType: amostra não enviesada (sem has_image), diferente de `items`
      // acima — mesma ressalva de dash.reportings.byType: é amostra, não
      // contagem exata (use classeTotalInventario para contagem exata por Classe).
      byType:         groupByField(inventoryData.typeSample || [], 'occurrenceType'),
      error:          inventoryData.error          ?? null,
    } : null,
    job: jobData ? {
      totalJobs:               jobData.totalJobs               ?? null,
      totalThisMonth:          jobData.totalThisMonth          ?? null,
      avgProgress:             jobData.avgProgress             ?? null,
      totalReportingCount:     jobData.totalReportingCount     ?? null,
      totalExecutedReportings: jobData.totalExecutedReportings ?? null,
      error:                   jobData.error                   ?? null,
    } : null,
    firm: firmData ? {
      total:  firmData.total  ?? null,
      firms:  firmData.firms  ?? [],
      error:  firmData.error  ?? null,
    } : null,
    summary: {
      usuariosAtivos:         usersData.totalCount  || users.counts.returned,
      usuariosRetornados:     users.counts.returned,
      apontamentosTotal:      apontamentosTotal,
      apontamentosRetornados: reportings.counts.returned,
      // Fotos — fonte primária: /Photo/ endpoint (distintos c/ foto / total apontamentos)
      // Fallback: pctFotosNaAmostra — % nos 100 mais recentes
      pctFotosHistorico,
      apontamentosFotoComFoto:    reportingUuids15d.length,
      apontamentosFotoRetornados: reportingUuids15d.length,
      apontamentosFotoTotalApi:   totalPhotos15d,
      fotoRawImageFields:         [],   // não mais usado — fotos vêm do /Photo/
      pctFotosNaAmostra:          reportings.pctComFotoNaAmostra ?? null,
      inventariosTotal:           inventoryData?.totalCount     ?? null,
      inventariosComFoto:         inventoryData?.withImageCount ?? null,
      inventariosItensComFoto:    inventoryItemsWithPhotos.length,
      programacaoTotal:         jobData?.totalJobs               ?? null,
      programacaoMes:           jobData?.totalThisMonth          ?? null,
      programacaoAvgProgress:   jobData?.avgProgress             ?? null,
      programacaoExecRate:      jobData?.execRate                ?? null,
      programacaoDimScore:      jobData?.dimProgramacoes         ?? null,
      programacaoConcluidas:    jobData?.concluidas              ?? null,
      programacaoEmAndamento:   jobData?.emAndamento             ?? null,
      programacaoAtrasadas:     jobData?.atrasadas               ?? null,
      programacaoJobsAtrasados: jobData?.jobsAtrasados           ?? [],
      programacaoReportingCount:      jobData?.totalReportingCount      ?? null,
      programacaoExecutedReportings:  jobData?.totalExecutedReportings  ?? null,
      equipeTotal:            firmData?.total ?? null,
      alertasTotal:           allAlerts.length,
      alertasCriticos:        alertasCriticos,
      alertasAtencao:         allAlerts.filter(a => a.severity === 'warning').length,
      erroUsers:              usersData.error      || null,
      erroReportings:         reportingsData.error || null,
      ultimoApontamentoData:      ultimoApontamento.data,
      diasDesdeUltimoApontamento: ultimoApontamento.dias,
      saudeScore:                 saudeScore,
      // Pilares do score — mesmos nomes/valores do Painel de Saúde (frontend),
      // expostos para o PDF consumir em vez de recalcular localmente.
      diasUsoScore:           pilaresRecencia.dimDiasUso,
      diasUsados:             pilaresRecencia.diasUsados,
      diasUteisDecorridos:    pilaresRecencia.diasUteisDecorridos,
      dias15Score:            pilaresRecencia.pct15Dias,
      dias15Usados:           pilaresRecencia.dias15Usados,
      diasUteisJanela:        pilaresRecencia.diasUteisJanela,
    },
  };
}

// ── Dashboard multi-concessão ────────────────────────────────────────────────
export function buildMultiDashboard(concessoesData) {
  const concessoes = concessoesData.map(d =>
    buildConcessaoDashboard(d.company, d.users, d.reportings, d.inventory || null, d.job || null, d.firm || null, d.reportingsMes || null, d.photos15d || null)
  );

  const totals = concessoes.reduce((acc, c) => ({
    usuariosAtivos: acc.usuariosAtivos + (c.summary.usuariosAtivos    || 0),
    apontamentos:   acc.apontamentos   + (c.summary.apontamentosTotal || 0),
    alertas:        acc.alertas        + c.summary.alertasTotal,
    criticos:       acc.criticos       + c.summary.alertasCriticos,
  }), { usuariosAtivos: 0, apontamentos: 0, alertas: 0, criticos: 0 });

  return {
    concessoes,
    totals,
    ranking: [...concessoes].sort((a, b) => b.summary.alertasCriticos - a.summary.alertasCriticos),
    generatedAt: new Date().toISOString(),
    source:      'api.kartado.com.br — dados em tempo real — somente usuários ativos',
  };
}
