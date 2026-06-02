import { useId, useState, type ChangeEvent } from 'react';
import { readMonitoringWorkbook } from '@/services/excelService';
import type { ImportedWorkbookData } from '@/types/monitoring';

interface ExcelUploaderProps {
  onDataLoaded: (data: ImportedWorkbookData) => void;
}

export function ExcelUploader({ onDataLoaded }: ExcelUploaderProps) {
  const inputId = useId();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);
      const parsedData = await readMonitoringWorkbook(selectedFile);
      onDataLoaded(parsedData);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível ler o arquivo informado.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  }

  return (
    <div className="window-accent rounded-[28px] border border-brand-100 bg-white p-6 shadow-panel">
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="section-kicker">
            Importação de planilha
          </p>
          <h3 className="mt-4 text-2xl font-semibold text-surface-900">
            Selecione a planilha de monitoramento
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-7 text-surface-700">
            O sistema identifica planilhas de armazenamento ou de usuários ProjectWise,
            converte os dados para indicadores e direciona automaticamente para a aba
            correspondente. São aceitos arquivos `.xlsx`, `.xls`, `.csv` e `.xml`.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 lg:min-w-[240px]">
          <label
            htmlFor={inputId}
            className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-600"
          >
            {isLoading ? 'Importando arquivo...' : 'Escolher planilha'}
          </label>
          <input
            id={inputId}
            type="file"
            className="sr-only"
            accept=".xlsx,.xls,.csv,.xml"
            onChange={handleFileChange}
          />
          <a
            href="/modelo-monitoramento.xml"
            download
            className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-center text-sm font-medium text-brand-700 transition hover:bg-brand-100"
          >
            Baixar arquivo de exemplo para teste
          </a>
        </div>
      </div>

      {errorMessage ? (
        <div className="relative z-10 mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
