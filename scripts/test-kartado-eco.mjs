import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import express from 'express';
import { parseEcoWorkbook } from '../server/services/kartado-eco-import.service.mjs';
import { createEcoRouter } from '../server/routes/kartado-eco.mjs';
const initial = JSON.parse(readFileSync(new URL('../src/data/kartado-eco/acompanhamento.json', import.meta.url), 'utf8'));
function buffer(data) { const w = XLSX.utils.book_new(); for (const [name,rows] of Object.entries(data)) XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(rows),name); return XLSX.write(w,{type:'buffer',bookType:'xlsx'}); }
const good = buffer(initial);
assert.deepEqual(parseEcoWorkbook(good), initial);
for (const mutate of [d => delete d.Pessoas, d => d.Unidades[0].PresencaMedia = 63, d => d.Reunioes[0].Unidade='Unknown', d => d.Unidades.push(d.Unidades[0]), d => d.Unidades[0].DataReferencia='2026-02-30']) {
  const d = structuredClone(initial); mutate(d); assert.throws(()=>parseEcoWorkbook(buffer(d)));
}
const zero = structuredClone(initial); zero.Reunioes[0].Presentes=0;
assert.equal(parseEcoWorkbook(buffer(zero)).Reunioes[0].Presentes,0);
assert.equal(parseEcoWorkbook(good).Reunioes.find(r=>r.Presentes===null).Presentes,null);
let saved=null, writes=0;
const app=express();
app.use('/eco',createEcoRouter({ authenticate:(req,res,next)=>{ if(!req.headers.authorization)return res.sendStatus(401); req.user={id:'test',role:req.headers.authorization};next(); },admin:(req,res,next)=>req.user.role==='admin'?next():res.sendStatus(403),execute:async(sql,args)=>{if(sql.startsWith('insert')){writes++;saved={id:'1',file_name:args[0],imported_at:new Date().toISOString(),payload:JSON.parse(args[2])};}return {rows:saved?[saved]:[]};}}));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const url=`http://127.0.0.1:${server.address().port}/eco`;
const post=(role,extra='',body=good)=>fetch(url+'?fileName=test.xlsx'+extra,{method:'POST',headers:{Authorization:role,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body});
try {
 assert.equal((await fetch(url)).status,401);
 assert.equal((await post('user')).status,403);
 assert.equal((await post('admin','&preview=true')).status,200);assert.equal(writes,0);
 assert.equal((await post('admin','',Buffer.from('invalid'))).status,400);assert.equal(writes,0);
 assert.equal((await post('admin')).status,200);assert.equal(writes,1);
 const persisted=await(await fetch(url,{headers:{Authorization:'user'}})).json();assert.deepEqual(persisted.payload,initial);
 console.log('Excel, validation, zero/null, authentication, admin restriction, preview without writes and shared retrieval: passed.');
} finally {server.close();}
