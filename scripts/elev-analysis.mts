import { readFileSync } from "fs";
import type { RunActivity } from "../src/lib/types";
const runs = JSON.parse(readFileSync("data/history.json","utf8")) as RunActivity[];

// Regress pace on (elev ft/mi, HR, distance) over measured runs with HR.
const pts = runs.filter(r => r.averageHeartrate && r.distanceMi >= 1.5 && !(r.raw as any)?.paceImputed)
  .map(r => ({ y: r.paceSecPerMi, e: r.elevationFt / r.distanceMi, h: r.averageHeartrate!, d: r.distanceMi }));
const n = pts.length;
const mean = (v:number[]) => v.reduce((a,b)=>a+b,0)/v.length;
const X = pts.map(p => [1, p.e, p.h, p.d]);
const y = pts.map(p => p.y);
const p = 4;
const A = Array.from({length:p},()=>Array(p+1).fill(0));
for (let i=0;i<n;i++) for (let a=0;a<p;a++){ A[a][p]+=X[i][a]*y[i]; for(let b=0;b<p;b++) A[a][b]+=X[i][a]*X[i][b]; }
for (let c=0;c<p;c++){ let piv=c; for(let r=c+1;r<p;r++) if(Math.abs(A[r][c])>Math.abs(A[piv][c])) piv=r;
  [A[c],A[piv]]=[A[piv],A[c]]; const dv=A[c][c]||1e-9;
  for(let k=c;k<=p;k++)A[c][k]/=dv;
  for(let r=0;r<p;r++){ if(r===c)continue; const f=A[r][c]; for(let k=c;k<=p;k++)A[r][k]-=f*A[c][k]; } }
const beta = A.map(r=>r[p]);
console.log(`Regression on ${n} measured HR runs — pace ~ intercept + elev(ft/mi) + HR + distance\n`);
console.log(`  elevation : ${beta[1].toFixed(3)} sec/mi per ft/mi of climb`);
console.log(`  heart rate: ${beta[2].toFixed(2)} sec/mi per bpm`);
console.log(`  distance  : ${beta[3].toFixed(2)} sec/mi per mile`);

const medElev = [...pts.map(x=>x.e)].sort((a,b)=>a-b)[Math.floor(n/2)];
console.log(`\n  median training elevation: ${medElev.toFixed(0)} ft/mi`);
console.log(`  flat-course credit at fitted rate: ${(medElev*beta[1]*13.1/60).toFixed(1)} min over 13.1 mi`);
console.log(`  (previous model assumed 0.25 s/ft/mi -> ${(medElev*0.25*13.1/60).toFixed(1)} min)`);

// EF by month, and matched-HR comparison
console.log("\nEFFICIENCY FACTOR by month (runs >= 2mi with HR)");
const byM: Record<string,number[]> = {};
for (const r of runs) {
  if (!r.averageHeartrate || r.distanceMi < 2) continue;
  const m = r.startDate.slice(0,7);
  (byM[m] ??= []).push(3600/r.paceSecPerMi/r.averageHeartrate);
}
for (const m of Object.keys(byM).sort()) {
  const v = byM[m].sort((a,b)=>a-b); const med = v[Math.floor(v.length/2)];
  console.log(`  ${m}  n=${String(v.length).padStart(2)}  median EF ${med.toFixed(4)}  ${"█".repeat(Math.round((med-0.028)*1200))}`);
}
