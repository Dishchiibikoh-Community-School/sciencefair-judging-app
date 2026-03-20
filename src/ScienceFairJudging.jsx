import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ─────────────────────────────────────────────
// CONSTANTS & MOCK DATA
// ─────────────────────────────────────────────
const INVITE_CODE = "FAIR2025";
const ADMIN_PASS  = "admin2025";

const ADJ  = ["Swift","Bright","Noble","Keen","Bold","Wise","Sharp","Calm","Steady","Vivid","Clever","Agile"];
const ANIM = ["Falcon","Owl","Dolphin","Eagle","Lynx","Fox","Hawk","Puma","Raven","Crane","Ibis","Orca"];

const RUBRIC = [
  { id:"method",     label:"Scientific Method",      desc:"Hypothesis, variables, controls, experimental design",     max:20 },
  { id:"research",   label:"Research & Background",  desc:"Literature review, citations, prior knowledge shown",      max:15 },
  { id:"data",       label:"Data & Analysis",        desc:"Data collection quality, statistical analysis, graphs",    max:20 },
  { id:"results",    label:"Results & Conclusions",  desc:"Accuracy, interpretation, implications of findings",       max:20 },
  { id:"display",    label:"Presentation & Display", desc:"Organization, clarity, visual appeal of display board",    max:15 },
  { id:"creativity", label:"Creativity & Innovation",desc:"Original thinking, novel approach or solution",            max:10 },
];

const PROJECTS = [
  { id:"p1", num:"001", title:"Effect of Microplastics on Aquatic Plant Growth",          cat:"Biology",       grade:"9"  },
  { id:"p2", num:"002", title:"Solar Cell Efficiency Under Different Light Spectra",       cat:"Physics",       grade:"10" },
  { id:"p3", num:"003", title:"ML Model for Early Detection of Crop Disease",              cat:"Computer Sci.", grade:"11" },
  { id:"p4", num:"004", title:"Biodegradable Packaging from Seaweed Polymers",            cat:"Chemistry",     grade:"10" },
  { id:"p5", num:"005", title:"Urban Heat Island Effect in City Neighborhoods",            cat:"Earth Science", grade:"9"  },
  { id:"p6", num:"006", title:"CRISPR Simulation: Targeting Antibiotic Resistance Genes", cat:"Biology",       grade:"12" },
  { id:"p7", num:"007", title:"Acoustic Levitation for Contactless Drug Delivery",        cat:"Physics",       grade:"11" },
  { id:"p8", num:"008", title:"Sentiment Analysis of Social Media in Climate Disasters",  cat:"Computer Sci.", grade:"10" },
];

const MEDALS = ["🥇","🥈","🥉"];

function assignProjects(idx) {
  const out = [];
  for (let i = 0; i < 4; i++) out.push(PROJECTS[(idx * 3 + i) % PROJECTS.length].id);
  return [...new Set(out)];
}
function genAlias(seed) {
  return `${ADJ[seed % ADJ.length]} ${ANIM[Math.floor(seed / ADJ.length) % ANIM.length]}`;
}
function uid()      { return Math.random().toString(36).slice(2, 10); }
function genToken() { return Array.from({length:4}, () => Math.random().toString(36).slice(2,6).toUpperCase()).join("-"); }
function fmt(ts)    { return new Date(ts).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }
function fmtFull(ts){ return new Date(ts).toLocaleString([], { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }); }
function fmtISO(ts) { return new Date(ts).toISOString(); }
function itId()     { return "EVT-" + Math.random().toString(36).slice(2,8).toUpperCase(); }

// IT log levels + modules
const IT_LEVELS  = ["ERROR","WARN","INFO","DEBUG"];
const IT_MODULES = { AUTH:"AUTH", JUDGE:"JUDGE", SCORE:"SCORE", ADMIN:"ADMIN", SHARE:"SHARE", SYSTEM:"SYSTEM", DB:"DB" };

// ─────────────────────────────────────────────
// SEED DEMO DATA
// ─────────────────────────────────────────────
const SEED_JUDGES = [
  { id:"j_a", alias:"Bold Falcon",  projects:["p1","p2","p3","p4"], joinedAt: Date.now()-3600000 },
  { id:"j_b", alias:"Wise Owl",     projects:["p3","p4","p5","p6"], joinedAt: Date.now()-2400000 },
  { id:"j_c", alias:"Swift Eagle",  projects:["p5","p6","p7","p8"], joinedAt: Date.now()-1800000 },
];
const SEED_SCORES = {
  "j_a_p1":{ method:17,research:13,data:16,results:17,display:12,creativity:8,  notes:"Excellent methodology.", time:Date.now()-3000000 },
  "j_a_p2":{ method:15,research:11,data:14,results:15,display:11,creativity:7,  notes:"Good work.",             time:Date.now()-2700000 },
  "j_b_p3":{ method:18,research:14,data:18,results:17,display:13,creativity:9,  notes:"Impressive ML work.",    time:Date.now()-2000000 },
  "j_b_p4":{ method:14,research:12,data:13,results:14,display:12,creativity:8,  notes:"Creative concept.",      time:Date.now()-1700000 },
  "j_c_p5":{ method:16,research:13,data:15,results:16,display:14,creativity:7,  notes:"Solid research.",        time:Date.now()-1200000 },
  "j_c_p6":{ method:19,research:14,data:17,results:18,display:14,creativity:10, notes:"Outstanding project.",   time:Date.now()-900000  },
};
const SEED_LOG = [
  { time:Date.now()-900000,  msg:"Swift Eagle submitted score for Project #006" },
  { time:Date.now()-1200000, msg:"Swift Eagle submitted score for Project #005" },
  { time:Date.now()-1700000, msg:"Wise Owl submitted score for Project #004"   },
  { time:Date.now()-2000000, msg:"Wise Owl submitted score for Project #003"   },
  { time:Date.now()-2700000, msg:"Bold Falcon submitted score for Project #002" },
  { time:Date.now()-3000000, msg:"Bold Falcon submitted score for Project #001" },
];

const SEED_IT = [
  { id:"EVT-A1B2C3", ts:Date.now()-3610000, level:"INFO",  module:"SYSTEM", event:"APP_BOOT",           detail:"Application initialized successfully",                          payload:{ env:"production", version:"1.0.0", judges:0, projects:8 } },
  { id:"EVT-D4E5F6", ts:Date.now()-3605000, level:"DEBUG", module:"DB",     event:"DB_CONNECT",         detail:"Database connection established",                               payload:{ host:"supabase.co", latency_ms:42, pool:5 } },
  { id:"EVT-G7H8I9", ts:Date.now()-3600000, level:"INFO",  module:"AUTH",   event:"JUDGE_REGISTERED",   detail:"New judge registered with valid invite code",                   payload:{ judgeId:"j_a", alias:"Bold Falcon", assignedProjects:["p1","p2","p3","p4"] } },
  { id:"EVT-J0K1L2", ts:Date.now()-2410000, level:"WARN",  module:"AUTH",   event:"INVALID_INVITE_CODE",detail:"Failed registration attempt with wrong invite code",            payload:{ attemptedCode:"TEST123", ip:"192.168.1.44", timestamp: fmtISO(Date.now()-2410000) } },
  { id:"EVT-M3N4O5", ts:Date.now()-2400000, level:"INFO",  module:"AUTH",   event:"JUDGE_REGISTERED",   detail:"New judge registered with valid invite code",                   payload:{ judgeId:"j_b", alias:"Wise Owl", assignedProjects:["p3","p4","p5","p6"] } },
  { id:"EVT-P6Q7R8", ts:Date.now()-1800000, level:"INFO",  module:"AUTH",   event:"JUDGE_REGISTERED",   detail:"New judge registered with valid invite code",                   payload:{ judgeId:"j_c", alias:"Swift Eagle", assignedProjects:["p5","p6","p7","p8"] } },
  { id:"EVT-S9T0U1", ts:Date.now()-3000000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_a", projectId:"p1", total:83, rubric:{method:17,research:13,data:16,results:17,display:12,creativity:8} } },
  { id:"EVT-V2W3X4", ts:Date.now()-2700000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_a", projectId:"p2", total:73, rubric:{method:15,research:11,data:14,results:15,display:11,creativity:7} } },
  { id:"EVT-Y5Z6A7", ts:Date.now()-2000000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_b", projectId:"p3", total:89, rubric:{method:18,research:14,data:18,results:17,display:13,creativity:9} } },
  { id:"EVT-B8C9D0", ts:Date.now()-1700000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_b", projectId:"p4", total:73, rubric:{method:14,research:12,data:13,results:14,display:12,creativity:8} } },
  { id:"EVT-E1F2G3", ts:Date.now()-1200000, level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_c", projectId:"p5", total:81, rubric:{method:16,research:13,data:15,results:16,display:14,creativity:7} } },
  { id:"EVT-H4I5J6", ts:Date.now()-900000,  level:"INFO",  module:"SCORE",  event:"SCORE_SUBMITTED",    detail:"Judge submitted score for assigned project",                    payload:{ judgeId:"j_c", projectId:"p6", total:92, rubric:{method:19,research:14,data:17,results:18,display:14,creativity:10} } },
  { id:"EVT-K7L8M9", ts:Date.now()-500000,  level:"WARN",  module:"AUTH",   event:"ADMIN_LOGIN_FAILED", detail:"Admin login attempted with incorrect password",                 payload:{ ip:"10.0.0.12", attempt:1 } },
  { id:"EVT-N0O1P2", ts:Date.now()-490000,  level:"INFO",  module:"AUTH",   event:"ADMIN_LOGIN_SUCCESS",detail:"Admin authenticated successfully",                              payload:{ ip:"10.0.0.12", sessionToken:"adm_***masked***" } },
  { id:"EVT-Q3R4S5", ts:Date.now()-200000,  level:"DEBUG", module:"DB",     event:"DB_QUERY",           detail:"Score read query executed",                                    payload:{ table:"scores", rows:6, latency_ms:8 } },
  { id:"EVT-T6U7V8", ts:Date.now()-100000,  level:"WARN",  module:"SCORE",  event:"ANOMALY_DETECTED",   detail:"Score deviation exceeds threshold between judges for project",  payload:{ projectId:"p1", scores:[83,92], avg:87.5, deviation:8.5, threshold:20 } },
];

// ─────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  :root{
    --bg:#07101f;--s1:#0d1b30;--s2:#132240;--bd:#1c2e4a;
    --gold:#f0a500;--gold2:#a37010;
    --text:#e2e8f5;--dim:#6b7fa3;
    --blue:#3b82f6;--green:#22c55e;--red:#ef4444;--amber:#f59e0b;--purple:#a78bfa;
    --r:12px;
    --ff-d:'Playfair Display',Georgia,serif;
    --ff-b:'DM Sans',sans-serif;
    --ff-m:'DM Mono',monospace;
  }
  body{background:var(--bg);color:var(--text);font-family:var(--ff-b);}
  .app{min-height:100vh;}
  .center{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem;}
  .inner{width:100%;max-width:560px;}

  /* LANDING */
  .glow{position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:700px;height:500px;
    background:radial-gradient(ellipse at 50% 0%,#1e5eb820 0%,transparent 70%);pointer-events:none;}
  .glow.purple{background:radial-gradient(ellipse at 50% 0%,#7c3aed15 0%,transparent 70%);}
  .school-banner{display:flex;flex-direction:column;align-items:center;gap:.6rem;margin-bottom:2rem;}
  .school-banner img{width:80px;height:80px;object-fit:contain;filter:drop-shadow(0 4px 16px #1e5eb840);}
  .school-name{font-family:var(--ff-d);font-size:clamp(1rem,3.5vw,1.25rem);font-weight:700;
    color:#fff;text-align:center;letter-spacing:.01em;line-height:1.25;}
  .school-name span{color:#5b9ef0;}
  .school-div{width:48px;height:2px;background:linear-gradient(90deg,transparent,#1e5eb8,transparent);margin:.2rem 0;}
  .land-badge{font-family:var(--ff-m);font-size:.7rem;letter-spacing:.18em;color:#5b9ef0;
    border:1px solid #1e5eb8;border-radius:100px;padding:.3rem 1rem;margin-bottom:2rem;display:inline-block;}
  .land-h1{font-family:var(--ff-d);font-size:clamp(2.2rem,6vw,3.8rem);font-weight:700;text-align:center;
    line-height:1.1;margin-bottom:.9rem;}
  .land-h1 span{color:#5b9ef0;}
  .land-p{color:var(--dim);text-align:center;max-width:400px;line-height:1.65;margin-bottom:3rem;}
  .role-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;width:100%;max-width:500px;}
  .role-grid.three{grid-template-columns:1fr 1fr;}
  @media(max-width:440px){.role-grid{grid-template-columns:1fr;}}
  .role-card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.75rem 1.5rem;
    cursor:pointer;transition:all .2s;text-align:center;}
  .role-card:hover{border-color:var(--gold2);background:var(--s2);transform:translateY(-2px);box-shadow:0 8px 32px #f0a50010;}
  .role-card.adm:hover{border-color:var(--blue);}
  .role-card.pub{grid-column:span 2;display:flex;align-items:center;gap:1.5rem;text-align:left;
    background:linear-gradient(135deg,#1a1500 0%,#0d1b30 60%);border-color:var(--gold2);}
  .role-card.pub:hover{border-color:var(--gold);box-shadow:0 8px 40px #f0a50018;}
  .role-card.pub .ico{font-size:3rem;flex-shrink:0;}
  .role-card .ico{font-size:2.4rem;margin-bottom:.65rem;}
  .role-card h3{font-size:1.05rem;font-weight:600;margin-bottom:.25rem;}
  .role-card p{font-size:.8rem;color:var(--dim);}
  .pub-pill{display:inline-flex;align-items:center;gap:.35rem;background:#16391e;border:1px solid #22c55e40;
    color:var(--green);font-size:.68rem;font-family:var(--ff-m);padding:.2rem .6rem;border-radius:100px;margin-bottom:.3rem;}
  .demo-hint{margin-top:2rem;font-size:.72rem;color:var(--dim);text-align:center;}
  .demo-hint strong{color:var(--gold);font-family:var(--ff-m);}

  /* SHARED */
  .back{background:none;border:none;color:var(--dim);cursor:pointer;font-family:var(--ff-b);
    font-size:.83rem;margin-bottom:1.5rem;padding:0;display:flex;align-items:center;gap:.3rem;}
  .back:hover{color:var(--text);}
  .card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.5rem;margin-bottom:.85rem;}
  .lbl{font-size:.72rem;font-family:var(--ff-m);letter-spacing:.1em;color:var(--dim);text-transform:uppercase;margin-bottom:.45rem;}
  input[type=text],input[type=password]{width:100%;background:var(--bg);border:1px solid var(--bd);
    border-radius:8px;padding:.8rem 1rem;color:var(--text);font-family:var(--ff-b);font-size:1rem;outline:none;transition:border-color .2s;}
  input[type=text]:read-only{color:var(--gold);font-family:var(--ff-m);font-size:.84rem;letter-spacing:.03em;cursor:default;}
  input:focus{border-color:var(--gold2);}
  .err{color:var(--red);font-size:.82rem;margin-top:.4rem;}
  textarea{width:100%;background:var(--bg);border:1px solid var(--bd);border-radius:8px;
    padding:.75rem 1rem;color:var(--text);font-family:var(--ff-b);font-size:.9rem;
    outline:none;resize:vertical;min-height:80px;transition:border-color .2s;}
  textarea:focus{border-color:var(--gold2);}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;background:var(--gold);
    color:#07101f;border:none;border-radius:8px;padding:.85rem 1.5rem;font-family:var(--ff-b);
    font-size:.95rem;font-weight:600;cursor:pointer;transition:all .2s;width:100%;}
  .btn:hover{background:#ffc020;}
  .btn:disabled{opacity:.4;cursor:not-allowed;}
  .btn.sec{background:var(--s2);color:var(--text);border:1px solid var(--bd);}
  .btn.sec:hover{border-color:var(--dim);}
  .btn.purple{background:#7c3aed;color:#fff;}
  .btn.purple:hover{background:#6d28d9;}
  .btn.danger{background:var(--red);color:#fff;}
  .btn.danger:hover{background:#dc2626;}
  .btn.sm{width:auto;padding:.45rem .9rem;font-size:.82rem;}
  .btn-row{display:flex;gap:.6rem;flex-wrap:wrap;}
  .pbar{background:var(--bd);border-radius:100px;overflow:hidden;}
  .pfill{background:linear-gradient(90deg,var(--gold),#ffc020);border-radius:100px;transition:width .5s ease;}
  .badge{display:inline-block;font-size:.7rem;font-family:var(--ff-m);padding:.2rem .6rem;border-radius:100px;}
  .bg{background:#16391e;color:var(--green);}
  .ba{background:#382a0a;color:var(--amber);}
  .br{background:#3a1010;color:var(--red);}
  .bb{background:#102040;color:#60a5fa;}
  .bp{background:#2d1b69;color:var(--purple);}

  /* TOGGLE */
  .toggle-wrap{display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;}
  .toggle{position:relative;width:44px;height:24px;flex-shrink:0;}
  .toggle input{opacity:0;width:0;height:0;}
  .toggle-slider{position:absolute;inset:0;background:var(--bd);border-radius:100px;cursor:pointer;transition:.2s;}
  .toggle-slider:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;
    background:#fff;border-radius:50%;transition:.2s;}
  .toggle input:checked + .toggle-slider{background:var(--green);}
  .toggle input:checked + .toggle-slider:before{transform:translateX(20px);}

  /* JUDGE */
  .jh-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;}
  .alias-tag{font-family:var(--ff-m);font-size:.75rem;background:var(--s2);border:1px solid var(--bd);
    color:var(--gold);padding:.3rem .85rem;border-radius:100px;}
  .proj-list{padding:.25rem;}
  .proj-item{display:flex;align-items:center;gap:.9rem;padding:.9rem .75rem;border-radius:10px;
    cursor:pointer;transition:all .15s;border:1px solid transparent;}
  .proj-item:hover{background:var(--s2);border-color:var(--bd);}
  .proj-num{font-family:var(--ff-m);font-size:.72rem;color:var(--gold);min-width:34px;}
  .proj-info{flex:1;}
  .proj-title{font-size:.9rem;font-weight:500;margin-bottom:.18rem;line-height:1.3;}
  .proj-meta{font-size:.76rem;color:var(--dim);}
  .proj-st{font-size:.72rem;font-family:var(--ff-m);padding:.18rem .55rem;border-radius:100px;white-space:nowrap;}
  .st-done{background:#16391e;color:var(--green);}
  .st-pend{background:var(--s2);color:var(--dim);}
  .locked-banner{background:#3a1010;border:1px solid #7c2020;border-radius:10px;padding:.7rem 1rem;
    text-align:center;font-size:.83rem;color:#fc9898;margin-bottom:1rem;}
  .all-done{background:#16391e;border:1px solid #22c55e30;border-radius:var(--r);padding:1.5rem;text-align:center;}

  /* SCORING */
  .sc-header{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.25rem 1.5rem;margin-bottom:1rem;}
  .sc-header h2{font-family:var(--ff-d);font-size:1.3rem;margin-bottom:.4rem;line-height:1.25;}
  .rub-item{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.2rem 1.4rem;margin-bottom:.7rem;}
  .rub-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.25rem;}
  .rub-lbl{font-weight:600;font-size:.9rem;}
  .rub-val{font-family:var(--ff-m);font-size:1rem;color:var(--gold);white-space:nowrap;}
  .rub-desc{font-size:.78rem;color:var(--dim);margin-bottom:.75rem;}
  input[type=range]{width:100%;height:4px;accent-color:var(--gold);cursor:pointer;}
  .rub-minmax{display:flex;justify-content:space-between;font-size:.68rem;color:var(--dim);margin-top:.2rem;}
  .sc-total{display:flex;align-items:center;justify-content:space-between;
    background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:1rem 1.5rem;margin-bottom:.85rem;}
  .sc-total-num{font-family:var(--ff-d);font-size:2.2rem;font-weight:700;color:var(--gold);}

  /* ADMIN */
  .admin-wrap{display:grid;grid-template-columns:210px 1fr;min-height:100vh;}
  @media(max-width:740px){.admin-wrap{grid-template-columns:1fr;}}
  .adm-side{background:var(--s1);border-right:1px solid var(--bd);padding:1.5rem 1rem;
    position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:.2rem;overflow-y:auto;}
  @media(max-width:740px){.adm-side{height:auto;position:static;flex-direction:row;flex-wrap:wrap;align-items:center;padding:1rem;gap:.4rem;}}
  .adm-brand{font-family:var(--ff-d);font-size:1.1rem;color:var(--gold);margin-bottom:1.5rem;}
  @media(max-width:740px){.adm-brand{margin:0;flex:1;}}
  .nav-it{display:flex;align-items:center;gap:.55rem;padding:.6rem .9rem;border-radius:8px;
    cursor:pointer;font-size:.86rem;color:var(--dim);transition:all .15s;border:1px solid transparent;}
  .nav-it:hover{background:var(--s2);color:var(--text);}
  .nav-it.act{background:var(--s2);color:var(--text);border-color:var(--bd);}
  .adm-main{padding:2rem;overflow-y:auto;}
  @media(max-width:480px){.adm-main{padding:1rem;}}
  .adm-h1{font-family:var(--ff-d);font-size:1.6rem;margin-bottom:.25rem;}
  .adm-sub{color:var(--dim);font-size:.83rem;margin-bottom:1.75rem;}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.85rem;margin-bottom:1.75rem;}
  .stat-card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.2rem;}
  .stat-v{font-family:var(--ff-d);font-size:2rem;font-weight:700;line-height:1;margin-bottom:.2rem;}
  .stat-l{font-size:.72rem;color:var(--dim);font-family:var(--ff-m);}
  .sec-title{font-family:var(--ff-d);font-size:1.1rem;margin-bottom:1rem;}
  .tbl-wrap{overflow-x:auto;}
  table{width:100%;border-collapse:collapse;font-size:.84rem;}
  th{font-family:var(--ff-m);font-size:.68rem;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;
    padding:.5rem 1rem;border-bottom:1px solid var(--bd);text-align:left;white-space:nowrap;}
  td{padding:.7rem 1rem;border-bottom:1px solid var(--bd);vertical-align:middle;}
  tr:last-child td{border-bottom:none;}
  tr:hover td{background:var(--s2);}
  .log-row{display:flex;align-items:flex-start;gap:.9rem;padding:.6rem 0;border-bottom:1px solid var(--bd);font-size:.84rem;}
  .log-t{font-family:var(--ff-m);color:var(--dim);font-size:.73rem;white-space:nowrap;min-width:55px;}
  .alert-box{display:flex;align-items:flex-start;gap:.75rem;background:#2a1505;border:1px solid #7c3a0a;
    border-radius:10px;padding:1rem 1.2rem;margin-bottom:.7rem;}
  .alert-ico{font-size:1.2rem;flex-shrink:0;margin-top:.1rem;}
  .alert-msg strong{display:block;margin-bottom:.2rem;font-size:.84rem;}
  .alert-msg span{font-size:.82rem;color:var(--dim);}
  .sys-row{display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;border-bottom:1px solid var(--bd);font-size:.85rem;}
  .sys-row:last-child{border:none;}

  /* SHARE */
  .share-status{display:flex;align-items:center;gap:.65rem;padding:1rem 1.2rem;border-radius:10px;margin-bottom:1.2rem;}
  .share-status.on{background:#0f2d1a;border:1px solid #22c55e40;color:var(--green);}
  .share-status.off{background:var(--s1);border:1px solid var(--bd);color:var(--dim);}
  .link-box{display:flex;gap:.5rem;align-items:stretch;}
  .link-box input{flex:1;}
  .copy-btn{background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:.7rem 1rem;
    color:var(--text);cursor:pointer;font-size:.82rem;white-space:nowrap;transition:all .15s;font-family:var(--ff-b);}
  .copy-btn:hover{border-color:var(--gold2);color:var(--gold);}
  .copy-btn.copied{border-color:var(--green);color:var(--green);}
  .token-pill{display:inline-flex;align-items:center;gap:.35rem;background:#2d1b69;border:1px solid #7c3aed40;
    color:var(--purple);font-family:var(--ff-m);font-size:.78rem;padding:.3rem .8rem;border-radius:100px;}
  .expiry-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem;}
  .expiry-opt{padding:.4rem .9rem;border-radius:8px;border:1px solid var(--bd);background:var(--s2);
    color:var(--dim);font-size:.8rem;cursor:pointer;transition:all .15s;}
  .expiry-opt:hover{border-color:var(--gold2);color:var(--text);}
  .expiry-opt.sel{border-color:var(--gold);color:var(--gold);background:#1c2a00;}
  .sec-notes div{font-size:.8rem;color:var(--dim);line-height:1.75;}
  .sec-notes strong{color:var(--text);}

  /* PUBLIC RESULTS */
  .pub-wrap{min-height:100vh;padding:2rem 1rem 3rem;}
  .pub-inner{max-width:780px;margin:0 auto;}
  .pub-hero{text-align:center;padding:2rem 1rem 1.5rem;position:relative;}
  .pub-hero h1{font-family:var(--ff-d);font-size:clamp(1.8rem,5vw,3rem);margin-bottom:.5rem;line-height:1.15;}
  .pub-hero p{color:var(--dim);font-size:.88rem;margin-top:.3rem;}
  .live-chip{display:inline-flex;align-items:center;gap:.4rem;background:#16391e;border:1px solid #22c55e30;
    color:var(--green);font-size:.7rem;font-family:var(--ff-m);padding:.3rem .85rem;border-radius:100px;margin-top:.75rem;}
  .podium-wrap{display:flex;align-items:flex-end;justify-content:center;gap:.75rem;margin:1.5rem 0 2rem;flex-wrap:wrap;}
  .podium-card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.25rem 1rem;text-align:center;
    transition:transform .2s,box-shadow .2s;cursor:default;}
  .podium-card:hover{transform:translateY(-4px);box-shadow:0 12px 40px #00000040;}
  .podium-card.p1{border-color:var(--gold2);background:linear-gradient(160deg,#1a150080,#0d1b30);}
  .podium-card.p2{border-color:#4a5568;}
  .podium-card.p3{border-color:#7c3a0a;}
  .p-medal{font-size:2.2rem;margin-bottom:.3rem;}
  .p-score{font-family:var(--ff-d);font-size:2.2rem;font-weight:700;}
  .p-title{font-size:.78rem;color:var(--dim);margin-top:.3rem;line-height:1.35;max-width:140px;margin-inline:auto;}
  .p-cat{margin-top:.4rem;}
  .p-revs{font-size:.7rem;color:var(--dim);margin-top:.2rem;}
  .results-table{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;margin-bottom:1.5rem;}
  .res-row{display:grid;grid-template-columns:46px 1fr auto;align-items:center;gap:1rem;padding:1rem 1.25rem;
    border-bottom:1px solid var(--bd);transition:background .15s;}
  .res-row:last-child{border:none;}
  .res-row:hover{background:var(--s2);}
  .res-rank{font-family:var(--ff-m);font-size:.8rem;color:var(--dim);text-align:center;}
  .res-title{font-size:.9rem;font-weight:500;margin-bottom:.15rem;line-height:1.3;}
  .res-meta{font-size:.74rem;color:var(--dim);margin-bottom:.35rem;}
  .rub-chips{display:flex;gap:.3rem;flex-wrap:wrap;}
  .rub-chip{font-size:.67rem;font-family:var(--ff-m);background:var(--s2);border:1px solid var(--bd);
    padding:.15rem .5rem;border-radius:100px;color:var(--dim);}
  .res-score{text-align:right;flex-shrink:0;}
  .res-score-big{font-family:var(--ff-d);font-size:1.6rem;color:var(--gold);}
  .res-score-sub{font-size:.7rem;color:var(--dim);}
  .pub-footer{text-align:center;padding:1.5rem 1rem;font-size:.75rem;color:var(--dim);line-height:1.8;
    border-top:1px solid var(--bd);margin-top:1rem;}

  /* IT LOGS */
  .it-toolbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:1.1rem;}
  .lvl-btn{padding:.35rem .8rem;border-radius:8px;border:1px solid var(--bd);background:var(--s2);
    font-family:var(--ff-m);font-size:.72rem;cursor:pointer;transition:all .15s;color:var(--dim);}
  .lvl-btn:hover{border-color:var(--gold2);color:var(--text);}
  .lvl-btn.f-ALL{border-color:var(--text);color:var(--text);}
  .lvl-btn.f-ERROR{border-color:var(--red);color:var(--red);background:#3a1010;}
  .lvl-btn.f-WARN{border-color:var(--amber);color:var(--amber);background:#382a0a;}
  .lvl-btn.f-INFO{border-color:#60a5fa;color:#60a5fa;background:#102040;}
  .lvl-btn.f-DEBUG{border-color:var(--purple);color:var(--purple);background:#2d1b69;}
  .it-term{background:#020c16;border:1px solid #0e2235;border-radius:var(--r);overflow:hidden;font-family:var(--ff-m);}
  .it-term-head{display:flex;align-items:center;justify-content:space-between;padding:.6rem 1rem;
    background:#040f1c;border-bottom:1px solid #0e2235;gap:.75rem;flex-wrap:wrap;}
  .it-term-dots{display:flex;gap:.4rem;}
  .it-term-dots span{width:10px;height:10px;border-radius:50%;display:inline-block;}
  .it-body{max-height:520px;overflow-y:auto;padding:.5rem 0;}
  .it-row{display:grid;grid-template-columns:200px 54px 70px 1fr;gap:.5rem 1rem;
    padding:.45rem 1rem;border-bottom:1px solid #0e2235;font-size:.76rem;align-items:start;cursor:pointer;transition:background .1s;}
  .it-row:last-child{border:none;}
  .it-row:hover{background:#0a1a2a;}
  .it-row.expanded{background:#0a1a2a;}
  .it-ts{color:#3a6080;white-space:nowrap;font-size:.69rem;}
  .it-lvl{font-weight:500;text-align:center;}
  .it-lvl.ERROR{color:var(--red);}
  .it-lvl.WARN{color:var(--amber);}
  .it-lvl.INFO{color:#60a5fa;}
  .it-lvl.DEBUG{color:var(--purple);}
  .it-mod{color:#3a8060;font-size:.7rem;}
  .it-msg{color:#9ab8cc;}
  .it-msg strong{color:#cde;font-weight:500;}
  .it-payload{grid-column:1/-1;background:#030d18;border:1px solid #0e2235;border-radius:8px;
    padding:.7rem 1rem;margin:.2rem 0 .3rem;font-size:.74rem;color:#7aa0b8;white-space:pre-wrap;
    word-break:break-all;line-height:1.65;}
  .it-empty{text-align:center;padding:3rem 1rem;color:#3a6080;font-size:.82rem;}
  .copy-report-btn{display:flex;align-items:center;gap:.4rem;background:#0a1a2a;border:1px solid #0e2235;
    border-radius:8px;padding:.45rem .9rem;color:#60a5fa;font-family:var(--ff-m);font-size:.75rem;
    cursor:pointer;transition:all .15s;white-space:nowrap;}
  .copy-report-btn:hover{border-color:#3b82f6;background:#0d2035;}
  .copy-report-btn.done{border-color:var(--green);color:var(--green);}
  .it-count{font-family:var(--ff-m);font-size:.72rem;color:var(--dim);}
  .snap-box{background:#020c16;border:1px solid #0e2235;border-radius:var(--r);padding:1.1rem 1.25rem;
    margin-bottom:1rem;font-family:var(--ff-m);font-size:.75rem;color:#7aa0b8;white-space:pre-wrap;
    line-height:1.7;max-height:240px;overflow-y:auto;}

  /* IT PIN GATE */
  .pin-gate{display:flex;flex-direction:column;align-items:center;justify-content:center;
    min-height:340px;text-align:center;padding:2rem;}
  .pin-gate .ico{font-size:3rem;margin-bottom:1rem;}
  .pin-gate h2{font-family:var(--ff-d);font-size:1.5rem;margin-bottom:.35rem;}
  .pin-gate p{color:var(--dim);font-size:.83rem;margin-bottom:1.75rem;max-width:320px;}
  .pin-dots{display:flex;gap:.65rem;justify-content:center;margin-bottom:1.25rem;}
  .pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--bd);
    background:var(--bg);transition:all .2s;}
  .pin-dot.filled{background:var(--gold);border-color:var(--gold);box-shadow:0 0 8px #f0a50060;}
  .pin-input-wrap{position:relative;width:180px;}
  .pin-input-wrap input[type=password]{
    text-align:center;letter-spacing:.5em;font-family:var(--ff-m);font-size:1.3rem;
    border-color:var(--bd);padding:.9rem 1rem;}
  .pin-input-wrap input[type=password]:focus{border-color:var(--gold2);}
  .pin-err{color:var(--red);font-size:.8rem;margin-top:.5rem;min-height:1.2em;}
  .pin-shake{animation:shake .35s ease;}
  @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
  .it-lock-badge{display:flex;align-items:center;gap:.4rem;font-family:var(--ff-m);font-size:.7rem;
    color:var(--dim);background:var(--s2);border:1px solid var(--bd);padding:.25rem .7rem;border-radius:100px;cursor:pointer;}
  .it-lock-badge:hover{border-color:var(--red);color:var(--red);}

  /* RESET MODAL */
  .modal-overlay{position:fixed;inset:0;background:#000000b0;backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;z-index:999;padding:1.5rem;}
  .modal-box{background:var(--s1);border:1px solid #7c2020;border-radius:16px;
    padding:2rem 1.75rem;width:100%;max-width:420px;text-align:center;
    box-shadow:0 24px 80px #ef444430;}
  .modal-box .ico{font-size:3rem;margin-bottom:.75rem;}
  .modal-box h2{font-family:var(--ff-d);font-size:1.5rem;margin-bottom:.4rem;color:#fca5a5;}
  .modal-box p{color:var(--dim);font-size:.84rem;line-height:1.6;margin-bottom:1.5rem;}
  .modal-box .warn-list{background:#2a1010;border:1px solid #7c2020;border-radius:10px;
    padding:.85rem 1rem;margin-bottom:1.5rem;text-align:left;}
  .modal-box .warn-list div{font-size:.8rem;color:#fca5a5;line-height:1.75;display:flex;gap:.4rem;}
  .modal-box .warn-list div::before{content:"✗";color:var(--red);flex-shrink:0;}
  .modal-pin-label{font-family:var(--ff-m);font-size:.7rem;letter-spacing:.12em;color:var(--dim);
    text-transform:uppercase;margin-bottom:.6rem;}
  .modal-pin-dots{display:flex;gap:.6rem;justify-content:center;margin-bottom:.85rem;}
  .modal-pin-dot{width:13px;height:13px;border-radius:50%;border:2px solid #7c2020;
    background:var(--bg);transition:all .2s;}
  .modal-pin-dot.filled{background:var(--red);border-color:var(--red);box-shadow:0 0 8px #ef444450;}
  .modal-btn-row{display:flex;gap:.65rem;margin-top:1rem;}
  .nav-it.reset{color:#fca5a5;border-color:transparent;}
  .nav-it.reset:hover{background:#3a1010;border-color:#7c2020;color:var(--red);}
`;

// ─────────────────────────────────────────────
// DB ↔ STATE MAPPERS
// ─────────────────────────────────────────────
function dbToJudge(row) {
  return { id: row.id, alias: row.alias, projects: row.projects, joinedAt: new Date(row.joined_at).getTime() };
}
function dbToLog(row) {
  return { time: new Date(row.created_at).getTime(), msg: row.message };
}
function dbToItLog(row) {
  return { id: row.id, ts: new Date(row.created_at).getTime(), level: row.level, module: row.module, event: row.event, detail: row.detail, payload: row.payload || {} };
}
function scoresToMap(rows) {
  return rows.reduce((acc, row) => {
    acc[`${row.judge_id}_${row.project_id}`] = {
      method: row.method, research: row.research, data: row.data,
      results: row.results, display: row.display, creativity: row.creativity,
      notes: row.notes || "", time: new Date(row.submitted_at).getTime(),
    };
    return acc;
  }, {});
}

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
export default function App() {
  const [view,       setView]    = useState("landing");
  const [judges,     setJudges]  = useState([]);
  const [scores,     setScores]  = useState({});
  const [log,        setLog]     = useState([]);
  const [locked,     setLocked]  = useState(false);
  const [loading,    setLoading] = useState(true);
  const [judge,      setJudge]   = useState(null);
  const [scoringPid, setScoringPid]  = useState(null);
  const [draftSc,    setDraftSc]     = useState({});
  const [draftNotes, setDraftNotes]  = useState("");
  const [regCode,    setRegCode]     = useState("");
  const [regErr,     setRegErr]      = useState("");
  const [adminPass,  setAdminPass]   = useState("");
  const [adminErr,   setAdminErr]    = useState("");
  const [adminTab,   setAdminTab]    = useState("overview");

  // Share state
  const [shareToken,      setShareToken]      = useState("");
  const [shareEnabled,    setShareEnabled]    = useState(false);
  const [shareExpiry,     setShareExpiry]     = useState("never");
  const [shareCreated,    setShareCreated]    = useState(null);
  const [shareShowRubric, setShareShowRubric] = useState(true);
  const [shareTitle,      setShareTitle]      = useState("Science Fair 2025 — Final Results");
  const [copied,          setCopied]          = useState(false);

  // IT logs state
  const [itLogs,       setItLogs]       = useState([]);
  const [itFilter,     setItFilter]     = useState("ALL");
  const [itExpanded,   setItExpanded]   = useState({});
  const [reportCopied, setReportCopied] = useState(false);
  const [snapCopied,   setSnapCopied]   = useState(false);
  const [itUnlocked,   setItUnlocked]   = useState(false);
  const [itPin,        setItPin]        = useState("");
  const [itPinErr,     setItPinErr]     = useState("");

  // Reset modal state
  const [showReset,    setShowReset]    = useState(false);
  const [resetPin,     setResetPin]     = useState("");
  const [resetPinErr,  setResetPinErr]  = useState("");
  const [resetDone,    setResetDone]    = useState(false);

  const EXPIRY_MS = { "1h":3600000, "24h":86400000, "7d":604800000, "never":Infinity };
  const EXPIRY_OPTS = [{ val:"1h",label:"1 Hour" },{ val:"24h",label:"24 Hours" },{ val:"7d",label:"7 Days" },{ val:"never",label:"Never" }];

  // ── SUPABASE LOADERS ──────────────────────────────────────
  async function loadJudges() {
    const { data } = await supabase.from("judges").select("*").order("joined_at");
    if (data) setJudges(data.map(dbToJudge));
  }
  async function loadScores() {
    const { data } = await supabase.from("scores").select("*");
    if (data) setScores(scoresToMap(data));
  }
  async function loadLog() {
    const { data } = await supabase.from("activity_log").select("*").order("created_at", { ascending: false });
    if (data) setLog(data.map(dbToLog));
  }
  async function loadItLogs() {
    const { data } = await supabase.from("it_logs").select("*").order("created_at", { ascending: false });
    if (data) setItLogs(data.map(dbToItLog));
  }
  async function loadShare() {
    const { data } = await supabase
      .from("share_links").select("*").is("revoked_at", null)
      .order("created_at", { ascending: false }).limit(1);
    if (data?.length) {
      const link = data[0];
      setShareToken(link.token); setShareEnabled(true);
      setShareExpiry(link.expiry); setShareCreated(new Date(link.created_at).getTime());
      setShareShowRubric(link.show_rubric); setShareTitle(link.title);
    } else {
      setShareToken(""); setShareEnabled(false); setShareCreated(null);
    }
  }
  async function loadSettings() {
    const { data } = await supabase.from("app_settings").select("value").eq("key", "locked").single();
    if (data) setLocked(data.value === "true");
  }

  // ── INITIAL LOAD + REALTIME SUBSCRIPTIONS ─────────────────
  useEffect(() => {
    async function init() {
      await Promise.all([loadJudges(), loadScores(), loadLog(), loadItLogs(), loadShare(), loadSettings()]);
      setLoading(false);
    }
    init();

    const channel = supabase.channel("app-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "judges" },       loadJudges)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" },       loadScores)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_log" }, loadLog)
      .on("postgres_changes", { event: "*", schema: "public", table: "it_logs" },      loadItLogs)
      .on("postgres_changes", { event: "*", schema: "public", table: "share_links" },  loadShare)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, loadSettings)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SESSION RESTORE ───────────────────────────────────────
  // After data loads, check if this browser was previously logged in as a judge.
  useEffect(() => {
    if (loading) return;
    const savedId = localStorage.getItem("sf_judge_id");
    if (savedId) {
      const found = judges.find(j => j.id === savedId);
      if (found) { setJudge(found); setView("judge-home"); }
      else localStorage.removeItem("sf_judge_id"); // judge was reset
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  function isLinkLive() {
    if (!shareEnabled || !shareToken) return false;
    if (shareExpiry === "never") return true;
    return shareCreated && (Date.now() - shareCreated) < EXPIRY_MS[shareExpiry];
  }

  function shareUrl() { return `${window.location.origin}?token=${shareToken}`; }

  async function generateLink() {
    const t = genToken();
    const { error } = await supabase.from("share_links").insert({
      token: t, expiry: shareExpiry, show_rubric: shareShowRubric, title: shareTitle,
    });
    if (!error) {
      setShareToken(t); setShareEnabled(true); setShareCreated(Date.now());
      addLog(`Admin generated public results link — token: ${t}`);
      addItLog("INFO","SHARE","LINK_GENERATED","Admin generated public results link",{ token:t, expiry:shareExpiry, showRubric:shareShowRubric });
    }
  }

  async function revokeLink() {
    await supabase.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("token", shareToken);
    addItLog("WARN","SHARE","LINK_REVOKED","Admin revoked public results link",{ token:shareToken, wasExpiry:shareExpiry });
    setShareEnabled(false); setShareToken(""); setShareCreated(null);
    addLog("Admin revoked public results link");
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl()).catch(()=>{});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  // Helpers — optimistic local update + fire-and-forget DB write.
  // Realtime subscriptions handle cross-client sync.
  function addLog(msg) {
    setLog(p => [{ time: Date.now(), msg }, ...p]);
    supabase.from("activity_log").insert({ message: msg });
  }

  function addItLog(level, module, event, detail, payload = {}) {
    const entry = { id: itId(), ts: Date.now(), level, module, event, detail, payload };
    setItLogs(p => [entry, ...p]);
    supabase.from("it_logs").insert({ id: entry.id, level, module, event, detail, payload });
  }

  function buildReport(logs) {
    const now = new Date().toISOString();
    const header = [
      "╔══════════════════════════════════════════════════════════════╗",
      "║        SCIENCE FAIR APP — IT DIAGNOSTIC REPORT              ║",
      "╚══════════════════════════════════════════════════════════════╝",
      `Generated  : ${now}`,
      `App Version: 1.0.0`,
      `Filter     : ${itFilter}`,
      "",
      "── SYSTEM STATE ──────────────────────────────────────────────",
      `Judges Registered : ${judges.length}`,
      `Projects          : ${PROJECTS.length}`,
      `Scores Submitted  : ${totalScored()} / ${possible()}`,
      `Completion        : ${Math.round((totalScored()/possible())*100)||0}%`,
      `Judging Locked    : ${locked}`,
      `Results Link Live : ${isLinkLive()}`,
      shareToken ? `Share Token       : ${shareToken}` : `Share Token       : (none)`,
      "",
      "── IT LOG ENTRIES ────────────────────────────────────────────",
    ].join("\n");

    const rows = logs.map(e =>
      `[${fmtISO(e.ts)}] [${e.level.padEnd(5)}] [${e.module.padEnd(6)}] ${e.event}\n` +
      `  → ${e.detail}\n` +
      `  PAYLOAD: ${JSON.stringify(e.payload)}`
    ).join("\n\n");

    const footer = [
      "",
      "── END OF REPORT ─────────────────────────────────────────────",
      `Total entries: ${logs.length}`,
    ].join("\n");

    return header + "\n\n" + rows + footer;
  }

  function buildSnapshot() {
    return [
      `SNAPSHOT @ ${new Date().toISOString()}`,
      `judges       = ${JSON.stringify(judges.map(j=>({id:j.id,alias:j.alias,projects:j.projects})))}`,
      `scores_count = ${totalScored()}`,
      `locked       = ${locked}`,
      `share_live   = ${isLinkLive()}`,
      `share_token  = "${shareToken||"none"}"`,
      `share_expiry = "${shareExpiry}"`,
      `anomalies    = ${JSON.stringify(getAnomalies())}`,
    ].join("\n");
  }

  function handleCopyReport() {
    const logs = itFilter === "ALL" ? itLogs : itLogs.filter(e => e.level === itFilter);
    navigator.clipboard.writeText(buildReport(logs)).catch(()=>{});
    setReportCopied(true); setTimeout(() => setReportCopied(false), 2500);
  }

  function handleCopySnapshot() {
    navigator.clipboard.writeText(buildSnapshot()).catch(()=>{});
    setSnapCopied(true); setTimeout(() => setSnapCopied(false), 2500);
  }

  function toggleItRow(id) {
    setItExpanded(p => ({ ...p, [id]: !p[id] }));
  }

  async function executeReset() {
    addItLog("WARN","ADMIN","FULL_RESET","Admin performed a full data reset of the application",{ judgesCleared:judges.length, scoresCleared:Object.keys(scores).length, timestamp:fmtISO(Date.now()) });
    // Delete all transient data. activity_log is intentionally excluded (security audit trail).
    await Promise.all([
      supabase.from("scores").delete().not("id", "is", null),
      supabase.from("judges").delete().neq("id", ""),
      supabase.from("share_links").delete().not("id", "is", null),
      supabase.from("app_settings").update({ value: "false" }).eq("key", "locked"),
    ]);
    setJudges([]);
    setScores({});
    addLog("Admin performed a full data reset — activity log preserved for security review");
    setLocked(false);
    setShareEnabled(false);
    setShareToken("");
    setShareCreated(null);
    setShareExpiry("never");
    setShareTitle("Science Fair 2025 — Final Results");
    setAdminTab("overview");
    setResetDone(true);
    setTimeout(() => { setShowReset(false); setResetDone(false); setResetPin(""); setResetPinErr(""); }, 1800);
  }

  async function handleToggleLock() {
    const next = !locked;
    await supabase.from("app_settings").update({ value: String(next) }).eq("key", "locked");
    setLocked(next);
    addLog(next ? "Admin locked judging" : "Admin unlocked judging");
    addItLog(next?"WARN":"INFO","ADMIN", next?"JUDGING_LOCKED":"JUDGING_UNLOCKED",
      next?"Admin locked judging — no more score submissions allowed":"Admin unlocked judging — submissions re-enabled",
      { lockedBy:"admin", timestamp:fmtISO(Date.now()) });
  }

  function getTotal(s) { return RUBRIC.reduce((t, r) => t + (Number(s[r.id]) || 0), 0); }

  function projAvg(pid) {
    const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${pid}`));
    if (!hits.length) return null;
    return (hits.reduce((s,[,v]) => s + getTotal(v), 0) / hits.length).toFixed(1);
  }

  function rubAvg(pid, rid) {
    const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${pid}`));
    if (!hits.length) return null;
    return (hits.reduce((s,[,v]) => s + (v[rid]||0), 0) / hits.length).toFixed(1);
  }

  function rankedProjects() {
    return PROJECTS
      .map(p => ({ ...p, avg: projAvg(p.id), revs: Object.keys(scores).filter(k => k.endsWith(`_${p.id}`)).length }))
      .sort((a,b) => (Number(b.avg)||0) - (Number(a.avg)||0));
  }

  function judgeComp(j) {
    const done = j.projects.filter(pid => scores[`${j.id}_${pid}`]).length;
    return { done, total: j.projects.length, pct: Math.round((done/j.projects.length)*100) };
  }

  function hasScored(pid) { return !!scores[`${judge?.id}_${pid}`]; }
  function totalScored()  { return Object.keys(scores).length; }
  function possible()     { return judges.reduce((s,j) => s + j.projects.length, 0); }
  function draftTotal()   { return RUBRIC.reduce((s,r) => s + (Number(draftSc[r.id])||0), 0); }
  function allMoved()     { return RUBRIC.every(r => draftSc[r.id] !== undefined); }

  function getAnomalies() {
    const out = [];
    PROJECTS.forEach(p => {
      const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${p.id}`));
      if (hits.length < 2) return;
      const tots = hits.map(([,s]) => getTotal(s));
      const avg  = tots.reduce((a,b) => a+b, 0) / tots.length;
      hits.forEach(([key,s]) => {
        const t = getTotal(s);
        if (Math.abs(t - avg) > 20) {
          const jj = judges.find(j => key.startsWith(j.id));
          out.push({ project: p.title, judge: jj?.alias || "Unknown", score: t, avg: avg.toFixed(1) });
        }
      });
    });
    return out;
  }

  // Actions
  async function handleRegister() {
    if (regCode.trim().toUpperCase() !== INVITE_CODE) {
      setRegErr("Invalid invite code.");
      addItLog("WARN","AUTH","INVALID_INVITE_CODE","Failed registration attempt with wrong invite code",{ attemptedCode: regCode.trim(), timestamp: fmtISO(Date.now()) });
      return;
    }
    const seed = judges.length;
    const j = { id:"j_"+uid(), alias:genAlias(seed), projects:assignProjects(seed), joinedAt:Date.now() };
    const { error } = await supabase.from("judges").insert({ id: j.id, alias: j.alias, projects: j.projects });
    if (error) { setRegErr("Registration failed. Please try again."); return; }
    setJudges(p => [...p, j]); setJudge(j);
    localStorage.setItem("sf_judge_id", j.id);
    addLog(`${j.alias} joined as a judge`);
    addItLog("INFO","AUTH","JUDGE_REGISTERED","New judge registered with valid invite code",{ judgeId:j.id, alias:j.alias, assignedProjects:j.projects });
    setRegCode(""); setRegErr(""); setView("judge-home");
  }

  function handleAdminLogin() {
    if (adminPass === ADMIN_PASS) {
      addItLog("INFO","AUTH","ADMIN_LOGIN_SUCCESS","Admin authenticated successfully",{ sessionToken:"adm_***masked***" });
      setView("admin-home"); setAdminPass(""); setAdminErr("");
    } else {
      addItLog("WARN","AUTH","ADMIN_LOGIN_FAILED","Admin login attempted with incorrect password",{ attempt: 1 });
      setAdminErr("Incorrect password.");
    }
  }

  function startScoring(pid) {
    setScoringPid(pid);
    const ex = scores[`${judge.id}_${pid}`];
    if (ex) { const {notes,time,...rs} = ex; setDraftSc(rs); setDraftNotes(notes||""); }
    else { setDraftSc({}); setDraftNotes(""); }
    setView("judge-scoring");
  }

  async function submitScore() {
    const total = draftTotal();
    setScores(p => ({ ...p, [`${judge.id}_${scoringPid}`]: { ...draftSc, notes:draftNotes, time:Date.now() } }));
    await supabase.from("scores").upsert({
      judge_id: judge.id, project_id: scoringPid,
      method: draftSc.method||0, research: draftSc.research||0,
      data: draftSc.data||0, results: draftSc.results||0,
      display: draftSc.display||0, creativity: draftSc.creativity||0,
      notes: draftNotes,
    }, { onConflict: "judge_id,project_id" });
    const proj = PROJECTS.find(p=>p.id===scoringPid);
    addLog(`${judge.alias} submitted score for Project #${proj.num}`);
    addItLog("INFO","SCORE","SCORE_SUBMITTED","Judge submitted score for assigned project",{ judgeId:judge.id, alias:judge.alias, projectId:scoringPid, projectNum:proj.num, total, rubric:draftSc });
    setView("judge-home");
  }

  // ─── VIEWS ───

  /* LOADING */
  if (loading) return (
    <div className="app"><style>{CSS}</style>
      <div className="center">
        <div style={{ textAlign:"center", color:"var(--dim)" }}>
          <div style={{ fontSize:"2rem", marginBottom:"1rem" }}>⏳</div>
          <div style={{ fontFamily:"var(--ff-m)", fontSize:".8rem", letterSpacing:".1em" }}>Connecting…</div>
        </div>
      </div>
    </div>
  );

  /* LANDING */
  if (view === "landing") return (
    <div className="app"><style>{CSS}</style>
      <div className="glow" />
      <div className="center" style={{ position:"relative" }}>
        <div className="school-banner">
          <img src="/logo.png" alt="Dishchiibikoh Community School" />
          <div className="school-name">Dishchiibikoh <span>Community School</span></div>
          <div className="school-div" />
        </div>
        <div className="land-badge">🔬 Science Fair 2025 · Digital Judging</div>
        <h1 className="land-h1">Judging <span>Portal</span></h1>
        <p className="land-p">A secure, anonymous, and digital evaluation platform for fair and accurate scoring of student science projects.</p>
        <div className="role-grid">
          <div className="role-card" onClick={() => setView("judge-register")}>
            <div className="ico">🧑‍⚖️</div><h3>I'm a Judge</h3><p>Score assigned projects with the guided rubric</p>
          </div>
          <div className="role-card adm" onClick={() => setView("admin-login")}>
            <div className="ico">🛡️</div><h3>Admin</h3><p>Monitor progress and manage the event</p>
          </div>
          {isLinkLive() && (
            <div className="role-card pub" onClick={() => setView("public-results")}>
              <div className="ico">🏆</div>
              <div>
                <div className="pub-pill">● LIVE RESULTS</div>
                <h3 style={{ marginBottom:".2rem" }}>View Results Dashboard</h3>
                <p>{shareTitle}</p>
              </div>
            </div>
          )}
        </div>
        <div className="demo-hint">
          Demo — Invite code: <strong>FAIR2025</strong> · Admin: <strong>admin2025</strong>
        </div>
      </div>
    </div>
  );

  /* JUDGE REGISTER */
  if (view === "judge-register") return (
    <div className="app"><style>{CSS}</style>
      <div className="center"><div className="inner">
        <button className="back" onClick={() => { setView("landing"); setRegErr(""); setRegCode(""); }}>← Back</button>
        <div className="card">
          <div style={{ textAlign:"center", marginBottom:"1.5rem" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:".5rem" }}>🔐</div>
            <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.5rem", marginBottom:".4rem" }}>Judge Registration</h2>
            <p style={{ color:"var(--dim)", fontSize:".83rem" }}>You'll get an anonymous alias to keep evaluations unbiased.</p>
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Invite Code</div>
            <input type="text" placeholder="e.g. FAIR2025" value={regCode}
              onChange={e => { setRegCode(e.target.value.toUpperCase()); setRegErr(""); }}
              onKeyDown={e => e.key==="Enter" && handleRegister()}
              style={{ textAlign:"center", letterSpacing:".18em", fontFamily:"var(--ff-m)", fontSize:"1.1rem" }} />
            {regErr && <div className="err">⚠ {regErr}</div>}
          </div>
          <button className="btn" onClick={handleRegister}>Enter as Judge →</button>
          <p style={{ textAlign:"center", fontSize:".72rem", color:"var(--dim)", marginTop:".9rem" }}>
            🔒 Your identity remains anonymous throughout the process.
          </p>
        </div>
      </div></div>
    </div>
  );

  /* JUDGE HOME */
  if (view === "judge-home" && judge) {
    const myProj = PROJECTS.filter(p => judge.projects.includes(p.id));
    const done   = myProj.filter(p => hasScored(p.id)).length;
    const pct    = Math.round((done / myProj.length) * 100);
    return (
      <div className="app"><style>{CSS}</style>
        <div className="center"><div className="inner">
          <div className="jh-top">
            <div>
              <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.4rem", marginBottom:".15rem" }}>My Projects</h2>
              <p style={{ color:"var(--dim)", fontSize:".8rem" }}>Score each project using the rubric</p>
            </div>
            <div className="alias-tag">👤 {judge.alias}</div>
          </div>
          {locked && <div className="locked-banner">🔒 Judging is currently locked by the administrator.</div>}
          <div className="card" style={{ padding:"1.1rem 1.4rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".45rem" }}>
              <span style={{ fontSize:".83rem" }}>Your Progress</span>
              <span style={{ fontFamily:"var(--ff-m)", fontSize:".83rem", color:"var(--gold)" }}>{done}/{myProj.length} scored</span>
            </div>
            <div className="pbar" style={{ height:"7px" }}><div className="pfill" style={{ width:`${pct}%`, height:"7px" }} /></div>
          </div>
          <div className="card proj-list">
            {myProj.map(proj => {
              const scored = hasScored(proj.id);
              const ex = scores[`${judge.id}_${proj.id}`];
              return (
                <div key={proj.id} className="proj-item"
                  onClick={() => !locked && startScoring(proj.id)}
                  style={{ cursor:locked?"not-allowed":"pointer", opacity:scored?.75:1 }}>
                  <div className="proj-num">#{proj.num}</div>
                  <div className="proj-info">
                    <div className="proj-title">{proj.title}</div>
                    <div className="proj-meta">{proj.cat} · Grade {proj.grade}</div>
                  </div>
                  {scored ? <span className="proj-st st-done">✓ {getTotal(ex)}pts</span>
                          : <span className="proj-st st-pend">Pending →</span>}
                </div>
              );
            })}
          </div>
          {done === myProj.length && (
            <div className="all-done">
              <div style={{ fontSize:"2rem", marginBottom:".4rem" }}>🎉</div>
              <div style={{ fontWeight:600, marginBottom:".2rem" }}>All projects scored!</div>
              <div style={{ fontSize:".82rem", color:"var(--dim)" }}>Thank you for your participation.</div>
            </div>
          )}
          <button className="btn sec" style={{ marginTop:".85rem" }} onClick={() => { setJudge(null); localStorage.removeItem("sf_judge_id"); setView("landing"); }}>Sign Out</button>
        </div></div>
      </div>
    );
  }

  /* JUDGE SCORING */
  if (view === "judge-scoring" && scoringPid) {
    const proj = PROJECTS.find(p => p.id === scoringPid);
    return (
      <div className="app"><style>{CSS}</style>
        <div className="center" style={{ justifyContent:"flex-start", paddingTop:"2rem" }}>
          <div className="inner">
            <button className="back" onClick={() => setView("judge-home")}>← Back to my projects</button>
            <div className="sc-header">
              <div style={{ fontFamily:"var(--ff-m)", fontSize:".7rem", color:"var(--gold)", marginBottom:".2rem" }}>PROJECT #{proj.num}</div>
              <h2>{proj.title}</h2>
              <div style={{ fontSize:".78rem", color:"var(--dim)", marginTop:".35rem" }}>{proj.cat} · Grade {proj.grade}</div>
            </div>
            {RUBRIC.map(r => (
              <div className="rub-item" key={r.id}>
                <div className="rub-top">
                  <span className="rub-lbl">{r.label}</span>
                  <span className="rub-val">{draftSc[r.id] !== undefined ? draftSc[r.id] : "—"} / {r.max}</span>
                </div>
                <div className="rub-desc">{r.desc}</div>
                <input type="range" min={0} max={r.max} step={1}
                  value={draftSc[r.id] !== undefined ? draftSc[r.id] : 0}
                  onChange={e => setDraftSc(p => ({ ...p, [r.id]: Number(e.target.value) }))} />
                <div className="rub-minmax"><span>0</span><span>{r.max}</span></div>
              </div>
            ))}
            <div className="card">
              <div className="lbl">Judge Notes (Optional)</div>
              <textarea placeholder="Add observations about this project…" value={draftNotes} onChange={e => setDraftNotes(e.target.value)} />
            </div>
            <div className="sc-total">
              <div><div className="lbl">Total Score</div><div style={{ fontSize:".76rem", color:"var(--dim)" }}>Out of 100 points</div></div>
              <div className="sc-total-num">{draftTotal()}</div>
            </div>
            <button className="btn" onClick={submitScore} disabled={!allMoved()}>Submit Score →</button>
            <p style={{ textAlign:"center", fontSize:".72rem", color:"var(--dim)", marginTop:".7rem" }}>You may revise this before judging closes.</p>
          </div>
        </div>
      </div>
    );
  }

  /* ADMIN LOGIN */
  if (view === "admin-login") return (
    <div className="app"><style>{CSS}</style>
      <div className="center"><div className="inner">
        <button className="back" onClick={() => { setView("landing"); setAdminErr(""); setAdminPass(""); }}>← Back</button>
        <div className="card">
          <div style={{ textAlign:"center", marginBottom:"1.5rem" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:".5rem" }}>🛡️</div>
            <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.5rem", marginBottom:".4rem" }}>Admin Access</h2>
            <p style={{ color:"var(--dim)", fontSize:".83rem" }}>Restricted to authorized science fair coordinators.</p>
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Password</div>
            <input type="password" placeholder="Enter admin password" value={adminPass}
              onChange={e => { setAdminPass(e.target.value); setAdminErr(""); }}
              onKeyDown={e => e.key==="Enter" && handleAdminLogin()} />
            {adminErr && <div className="err">⚠ {adminErr}</div>}
          </div>
          <button className="btn" onClick={handleAdminLogin}>Access Dashboard →</button>
        </div>
      </div></div>
    </div>
  );

  /* ADMIN DASHBOARD */
  if (view === "admin-home") {
    const anomalies  = getAnomalies();
    const completion = Math.round((totalScored() / possible()) * 100) || 0;

    const navItems = [
      { id:"overview", ico:"📊", label:"Overview"     },
      { id:"judges",   ico:"👥", label:"Judges"       },
      { id:"projects", ico:"🔬", label:"Projects"     },
      { id:"activity", ico:"📋", label:"Activity Log" },
      { id:"alerts",   ico:"⚠️", label:`Alerts${anomalies.length?` (${anomalies.length})`:""}`},
      { id:"share",    ico:"🔗", label:"Share Results" },
      { id:"itlogs",   ico:"🖥️", label:"IT Logs"      },
    ];

    return (
      <div className="app"><style>{CSS}</style>
        <div className="admin-wrap">
          <div className="adm-side">
            <div className="adm-brand">⚗️ Admin Panel</div>
            {navItems.map(n => (
              <div key={n.id} className={`nav-it ${adminTab===n.id?"act":""}`} onClick={() => setAdminTab(n.id)}>
                <span>{n.ico}</span><span>{n.label}</span>
                {n.id==="share" && isLinkLive() && (
                  <span className="badge bg" style={{ marginLeft:"auto", fontSize:".6rem", padding:".1rem .4rem" }}>LIVE</span>
                )}
              </div>
            ))}
            <div style={{ flex:1 }} />
            <div className="nav-it" style={{ color:locked?"var(--red)":"var(--green)" }}
              onClick={handleToggleLock}>
              <span>{locked?"🔒":"🔓"}</span><span>{locked?"Unlock":"Lock"} Judging</span>
            </div>
            <div className="nav-it" onClick={() => setView("landing")}><span>←</span><span>Exit</span></div>
            <div className="nav-it reset" onClick={() => { setShowReset(true); setResetPin(""); setResetPinErr(""); setResetDone(false); }}>
              <span>⚠️</span><span>Reset All Data</span>
            </div>
          </div>

          {/* ── RESET MODAL ── */}
          {showReset && (
            <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget){ setShowReset(false); setResetPin(""); setResetPinErr(""); }}}>
              <div className="modal-box">
                {resetDone ? (
                  <>
                    <div className="ico">✅</div>
                    <h2 style={{color:"var(--green)"}}>Reset Complete</h2>
                    <p>All data has been cleared. Returning to dashboard…</p>
                  </>
                ) : (
                  <>
                    <div className="ico">⚠️</div>
                    <h2>Reset All Data?</h2>
                    <p>This will permanently erase all judging data for this session. This cannot be undone.</p>
                    <div className="warn-list">
                      <div>All registered judges removed</div>
                      <div>All submitted scores deleted</div>
                      <div>Share link revoked</div>
                      <div>Judging lock reset to open</div>
                    </div>
                    <div style={{background:"#0f2d1a",border:"1px solid #22c55e30",borderRadius:"10px",
                      padding:".65rem 1rem",marginBottom:"1.5rem",textAlign:"left"}}>
                      <div style={{fontSize:".8rem",color:"var(--green)",display:"flex",gap:".4rem"}}>
                        <span>✓</span><span>Activity log is <strong>preserved</strong> for security &amp; review purposes</span>
                      </div>
                    </div>
                    <div className="modal-pin-label">Enter PIN to confirm</div>
                    <div className="modal-pin-dots">
                      {[0,1,2,3].map(i => (
                        <div key={i} className={`modal-pin-dot ${resetPin.length > i ? "filled" : ""}`} />
                      ))}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:".25rem"}}>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="••••"
                        value={resetPin}
                        autoFocus
                        style={{
                          width:"160px", textAlign:"center", letterSpacing:".5em",
                          fontFamily:"var(--ff-m)", fontSize:"1.3rem",
                          background:"var(--bg)", border:`1px solid ${resetPinErr?"var(--red)":"var(--bd)"}`,
                          borderRadius:"8px", padding:".8rem 1rem", color:"var(--text)", outline:"none"
                        }}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g,"").slice(0,4);
                          setResetPin(val);
                          setResetPinErr("");
                          if (val.length === 4) {
                            if (val === "1680") {
                              executeReset();
                            } else {
                              setResetPinErr("Incorrect PIN.");
                              addItLog("WARN","AUTH","RESET_PIN_FAILED","Reset attempted with wrong PIN",{ timestamp:fmtISO(Date.now()) });
                              setTimeout(() => setResetPin(""), 600);
                            }
                          }
                        }}
                      />
                      {resetPinErr && <div style={{color:"var(--red)",fontSize:".8rem",marginTop:".25rem"}}>{resetPinErr}</div>}
                    </div>
                    <div className="modal-btn-row">
                      <button className="btn sec" onClick={() => { setShowReset(false); setResetPin(""); setResetPinErr(""); }}>
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="adm-main">

            {/* OVERVIEW */}
            {adminTab==="overview" && <>
              <div className="adm-h1">Dashboard Overview</div>
              <div className="adm-sub">Live judging progress · Science Fair 2025</div>
              {locked && <div className="locked-banner">🔒 Judging LOCKED — judges cannot submit scores</div>}
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-v" style={{color:"var(--gold)"}}>{judges.length}</div><div className="stat-l">Judges</div></div>
                <div className="stat-card"><div className="stat-v" style={{color:"var(--blue)"}}>{PROJECTS.length}</div><div className="stat-l">Projects</div></div>
                <div className="stat-card"><div className="stat-v" style={{color:"var(--green)"}}>{totalScored()}</div><div className="stat-l">Scores In</div></div>
                <div className="stat-card">
                  <div className="stat-v" style={{color:completion<50?"var(--red)":completion<80?"var(--amber)":"var(--green)"}}>{completion}%</div>
                  <div className="stat-l">Completion</div>
                </div>
              </div>
              <div className="card">
                <div style={{display:"flex",justifyContent:"space-between",fontSize:".82rem",marginBottom:".4rem"}}>
                  <span style={{color:"var(--dim)"}}>Overall completion</span>
                  <span style={{fontFamily:"var(--ff-m)"}}>{totalScored()} / {possible()}</span>
                </div>
                <div className="pbar" style={{height:"10px"}}><div className="pfill" style={{width:`${completion}%`,height:"10px"}} /></div>
              </div>
              <div className="card">
                <div className="sec-title">Project Leaderboard</div>
                <div className="tbl-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Project</th><th>Category</th><th>Avg</th><th>Reviews</th></tr></thead>
                    <tbody>
                      {rankedProjects().map((p,i) => (
                        <tr key={p.id}>
                          <td style={{fontFamily:"var(--ff-m)",color:"var(--dim)"}}>{i+1}</td>
                          <td style={{maxWidth:"200px"}}>{p.title}</td>
                          <td><span className="badge bb">{p.cat}</span></td>
                          <td style={{fontFamily:"var(--ff-m)",color:p.avg?"var(--gold)":"var(--dim)"}}>{p.avg??("—")}</td>
                          <td>{p.revs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>}

            {/* JUDGES */}
            {adminTab==="judges" && <>
              <div className="adm-h1">Judge Management</div>
              <div className="adm-sub">Monitor activity and completion per judge</div>
              <div className="card"><div className="tbl-wrap">
                <table>
                  <thead><tr><th>Alias</th><th>Joined</th><th>Assigned</th><th>Progress</th><th>Status</th></tr></thead>
                  <tbody>
                    {judges.map(j => {
                      const {done,total,pct} = judgeComp(j);
                      return (
                        <tr key={j.id}>
                          <td style={{fontFamily:"var(--ff-m)",color:"var(--gold)"}}>{j.alias}</td>
                          <td style={{color:"var(--dim)",fontSize:".78rem"}}>{fmt(j.joinedAt)}</td>
                          <td>{total}</td>
                          <td>
                            <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                              <div className="pbar" style={{width:"60px",height:"4px"}}>
                                <div className="pfill" style={{width:`${pct}%`,height:"4px"}} />
                              </div>
                              <span style={{fontFamily:"var(--ff-m)",fontSize:".76rem"}}>{done}/{total}</span>
                            </div>
                          </td>
                          <td><span className={`badge ${done===total?"bg":done>0?"ba":"br"}`}>
                            {done===total?"Complete":done>0?"In Progress":"Not Started"}
                          </span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div></div>
            </>}

            {/* PROJECTS */}
            {adminTab==="projects" && <>
              <div className="adm-h1">Projects Overview</div>
              <div className="adm-sub">Per-rubric breakdown</div>
              {PROJECTS.map(p => {
                const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${p.id}`));
                const avg  = projAvg(p.id);
                return (
                  <div className="card" key={p.id} style={{marginBottom:".75rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"1rem",flexWrap:"wrap"}}>
                      <div>
                        <div style={{fontFamily:"var(--ff-m)",fontSize:".7rem",color:"var(--gold)",marginBottom:".2rem"}}>#{p.num} · {p.cat}</div>
                        <div style={{fontWeight:600,marginBottom:".2rem",lineHeight:1.3}}>{p.title}</div>
                        <div style={{fontSize:".76rem",color:"var(--dim)"}}>Grade {p.grade} · {hits.length} review{hits.length!==1?"s":""}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontFamily:"var(--ff-d)",fontSize:"2rem",color:avg?"var(--gold)":"var(--dim)"}}>{avg??"—"}</div>
                        <div style={{fontSize:".7rem",color:"var(--dim)"}}>avg / 100</div>
                      </div>
                    </div>
                    {hits.length > 0 && (
                      <div style={{marginTop:".75rem",borderTop:"1px solid var(--bd)",paddingTop:".75rem"}}>
                        {RUBRIC.map(r => {
                          const avgR = hits.reduce((s,[,sc]) => s+(sc[r.id]||0),0) / hits.length;
                          return (
                            <div key={r.id} style={{display:"flex",alignItems:"center",gap:".65rem",marginBottom:".35rem"}}>
                              <span style={{fontSize:".73rem",color:"var(--dim)",width:"125px",flexShrink:0}}>{r.label}</span>
                              <div className="pbar" style={{flex:1,height:"4px"}}>
                                <div className="pfill" style={{width:`${(avgR/r.max)*100}%`,height:"4px"}} />
                              </div>
                              <span style={{fontFamily:"var(--ff-m)",fontSize:".73rem",width:"38px",textAlign:"right"}}>{avgR.toFixed(1)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>}

            {/* ACTIVITY */}
            {adminTab==="activity" && <>
              <div className="adm-h1">Activity Log</div>
              <div className="adm-sub">Timestamped record of all actions</div>
              <div className="card">
                {log.map((e,i) => (
                  <div className="log-row" key={i}>
                    <div className="log-t">{fmt(e.time)}</div>
                    <div>{e.msg}</div>
                  </div>
                ))}
              </div>
            </>}

            {/* ALERTS */}
            {adminTab==="alerts" && <>
              <div className="adm-h1">Alerts & Anomalies</div>
              <div className="adm-sub">Score outliers and system warnings</div>
              {anomalies.length === 0
                ? <div className="all-done"><div style={{fontSize:"2rem",marginBottom:".4rem"}}>✅</div>
                    <div style={{fontWeight:600}}>No anomalies detected</div>
                    <div style={{fontSize:".82rem",color:"var(--dim)",marginTop:".25rem"}}>All scores are within expected range.</div>
                  </div>
                : anomalies.map((a,i) => (
                    <div className="alert-box" key={i}>
                      <div className="alert-ico">⚠️</div>
                      <div className="alert-msg">
                        <strong>Score Outlier — Review Recommended</strong>
                        <span><strong>{a.judge}</strong> scored <strong>{a.score}/100</strong> — group avg is <strong>{a.avg}</strong>. Deviation &gt; 20 pts.</span>
                      </div>
                    </div>
                  ))
              }
              <div className="card" style={{marginTop:"1.5rem"}}>
                <div className="sec-title">System Status</div>
                <div className="sys-row"><span style={{color:"var(--dim)"}}>Database</span><span className="badge bg">● Operational</span></div>
                <div className="sys-row"><span style={{color:"var(--dim)"}}>Judging</span><span className={`badge ${locked?"br":"bg"}`}>{locked?"🔒 Locked":"🔓 Open"}</span></div>
                <div className="sys-row"><span style={{color:"var(--dim)"}}>Results Link</span><span className={`badge ${isLinkLive()?"bg":"br"}`}>{isLinkLive()?"Live":"Disabled"}</span></div>
                <div className="sys-row"><span style={{color:"var(--dim)"}}>Score Records</span><span style={{fontFamily:"var(--ff-m)"}}>{totalScored()}</span></div>
              </div>
            </>}

            {/* SHARE RESULTS */}
            {adminTab==="share" && <>
              <div className="adm-h1">Share Results</div>
              <div className="adm-sub">Generate a public link for parents, students, and attendees — no login required to view.</div>

              {/* Status bar */}
              <div className={`share-status ${isLinkLive()?"on":"off"}`}>
                <span style={{fontSize:"1.2rem"}}>{isLinkLive()?"🟢":"⚫"}</span>
                <div>
                  <div style={{fontWeight:500,fontSize:".88rem"}}>{isLinkLive()?"Results link is LIVE":"Results link is disabled"}</div>
                  <div style={{fontSize:".78rem",opacity:.7}}>{isLinkLive()?"Anyone with the link can view the public results dashboard.":"Generate a link below to share results."}</div>
                </div>
              </div>

              {/* Active link panel */}
              {isLinkLive() && (
                <div className="card">
                  <div className="lbl" style={{marginBottom:".6rem"}}>Public Results URL</div>
                  <div className="link-box" style={{marginBottom:".75rem"}}>
                    <input type="text" readOnly value={shareUrl()} />
                    <button className={`copy-btn ${copied?"copied":""}`} onClick={handleCopy}>
                      {copied ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:".75rem",flexWrap:"wrap",marginBottom:"1.1rem"}}>
                    <span className="token-pill">🔑 {shareToken}</span>
                    {shareExpiry==="never"
                      ? <span style={{fontSize:".75rem",color:"var(--green)"}}>✓ No expiry</span>
                      : <span style={{fontSize:".75rem",color:"var(--amber)"}}>⏱ Expires {EXPIRY_OPTS.find(e=>e.val===shareExpiry)?.label} from {fmtFull(shareCreated)}</span>
                    }
                  </div>
                  <div className="btn-row">
                    <button className="btn purple sm" onClick={() => setView("public-results")}>👁 Preview Page</button>
                    <button className="btn danger sm" onClick={revokeLink}>🚫 Revoke Link</button>
                  </div>
                </div>
              )}

              {/* Settings card */}
              <div className="card">
                <div className="sec-title">Link Settings</div>

                <div style={{marginBottom:"1.2rem"}}>
                  <div className="lbl">Page Title (shown to public)</div>
                  <input type="text" value={shareTitle} onChange={e => setShareTitle(e.target.value)} placeholder="Science Fair 2025 — Final Results" />
                </div>

                <div style={{marginBottom:"1.2rem"}}>
                  <div className="lbl">Link Expiry</div>
                  <div className="expiry-row">
                    {EXPIRY_OPTS.map(o => (
                      <div key={o.val} className={`expiry-opt ${shareExpiry===o.val?"sel":""}`} onClick={() => setShareExpiry(o.val)}>
                        {o.label}
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:".73rem",color:"var(--dim)",marginTop:".5rem"}}>After expiry, viewers see an "expired" message. You can always regenerate.</div>
                </div>

                <div style={{background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:"10px",padding:"1rem",marginBottom:"1.2rem"}}>
                  <div className="toggle-wrap">
                    <div>
                      <div style={{fontSize:".88rem",fontWeight:500}}>Show rubric breakdown</div>
                      <div style={{fontSize:".75rem",color:"var(--dim)",marginTop:".1rem"}}>Viewers see per-category scores, not just totals</div>
                    </div>
                    <label className="toggle">
                      <input type="checkbox" checked={shareShowRubric} onChange={e => setShareShowRubric(e.target.checked)} />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>

                <button className="btn" onClick={generateLink}>
                  {isLinkLive() ? "🔄 Regenerate New Link" : "🔗 Generate Results Link"}
                </button>
                {isLinkLive() && (
                  <p style={{fontSize:".72rem",color:"var(--amber)",marginTop:".5rem",textAlign:"center"}}>
                    ⚠ Regenerating invalidates the current link immediately.
                  </p>
                )}
              </div>

              {/* Security notes */}
              <div className="card sec-notes" style={{background:"var(--bg)"}}>
                <div style={{fontFamily:"var(--ff-d)",fontSize:".95rem",marginBottom:".75rem"}}>🔐 Security Notes</div>
                <div>• Secured by a <strong>unique random token</strong> — unguessable without the URL.</div>
                <div>• Shows <strong>project names and scores only</strong> — judge aliases are never exposed.</div>
                <div>• <strong>Revoke anytime</strong> — the link stops working instantly.</div>
                <div>• Use <strong>expiry</strong> to auto-disable the link after the event ends.</div>
              </div>
            </>}

            {/* IT LOGS */}
            {adminTab==="itlogs" && (()=>{
              // ── PIN GATE ──
              if (!itUnlocked) return (
                <div className="pin-gate">
                  <div className="ico">🔐</div>
                  <h2>IT Access Required</h2>
                  <p>This section contains sensitive diagnostic data. Enter the IT PIN to continue.</p>
                  <div className="pin-dots">
                    {[0,1,2,3].map(i => (
                      <div key={i} className={`pin-dot ${itPin.length > i ? "filled" : ""}`} />
                    ))}
                  </div>
                  <div className="pin-input-wrap">
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="••••"
                      value={itPin}
                      className={itPinErr ? "pin-shake" : ""}
                      autoFocus
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g,"").slice(0,4);
                        setItPin(val);
                        setItPinErr("");
                        if (val.length === 4) {
                          if (val === "1680") {
                            setItUnlocked(true);
                            setItPin("");
                            addItLog("INFO","AUTH","IT_ACCESS_GRANTED","IT diagnostic logs accessed with correct PIN",{ timestamp:fmtISO(Date.now()) });
                          } else {
                            setItPinErr("Incorrect PIN. Try again.");
                            addItLog("WARN","AUTH","IT_ACCESS_DENIED","IT diagnostic logs access attempt with wrong PIN",{ timestamp:fmtISO(Date.now()) });
                            setTimeout(() => setItPin(""), 600);
                          }
                        }
                      }}
                    />
                    <div className="pin-err">{itPinErr}</div>
                  </div>
                </div>
              );

              // ── UNLOCKED VIEW ──
              const filtered = itFilter==="ALL" ? itLogs : itLogs.filter(e=>e.level===itFilter);
              const errCount  = itLogs.filter(e=>e.level==="ERROR").length;
              const warnCount = itLogs.filter(e=>e.level==="WARN").length;
              return <>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:".75rem",marginBottom:".25rem"}}>
                  <div>
                    <div className="adm-h1">IT Diagnostic Logs</div>
                    <div className="adm-sub" style={{marginBottom:0}}>Structured event log for debugging — copy & paste directly into AI for analysis.</div>
                  </div>
                  <div className="it-lock-badge" onClick={() => { setItUnlocked(false); setItPin(""); setItPinErr(""); addItLog("INFO","AUTH","IT_ACCESS_LOCKED","IT diagnostic logs manually locked",{ timestamp:fmtISO(Date.now()) }); }}>
                    🔒 Lock IT Logs
                  </div>
                </div>
                <div style={{marginBottom:"1.5rem"}} />
                {/* Quick stats */}
                <div className="stat-grid" style={{marginBottom:"1rem"}}>
                  <div className="stat-card"><div className="stat-v" style={{color:"var(--text)",fontSize:"1.5rem"}}>{itLogs.length}</div><div className="stat-l">Total Events</div></div>
                  <div className="stat-card"><div className="stat-v" style={{color:"var(--red)",fontSize:"1.5rem"}}>{errCount}</div><div className="stat-l">Errors</div></div>
                  <div className="stat-card"><div className="stat-v" style={{color:"var(--amber)",fontSize:"1.5rem"}}>{warnCount}</div><div className="stat-l">Warnings</div></div>
                  <div className="stat-card"><div className="stat-v" style={{color:"var(--green)",fontSize:"1.5rem"}}>{itLogs.filter(e=>e.level==="INFO").length}</div><div className="stat-l">Info</div></div>
                </div>

                {/* Toolbar */}
                <div className="it-toolbar">
                  {["ALL",...IT_LEVELS].map(lv => (
                    <button key={lv} className={`lvl-btn ${itFilter===lv?`f-${lv}`:""}`} onClick={()=>setItFilter(lv)}>
                      {lv==="ALL"?"ALL LEVELS":lv}
                      {lv!=="ALL" && <span style={{marginLeft:".35rem",opacity:.6}}>({itLogs.filter(e=>e.level===lv).length})</span>}
                    </button>
                  ))}
                  <div style={{flex:1}} />
                  <span className="it-count">{filtered.length} entries</span>
                  <button className={`copy-report-btn ${reportCopied?"done":""}`} onClick={handleCopyReport}>
                    {reportCopied ? "✓ Copied!" : "📋 Copy Full Report"}
                  </button>
                </div>

                {/* Terminal */}
                <div className="it-term">
                  <div className="it-term-head">
                    <div className="it-term-dots">
                      <span style={{background:"#ff5f57"}} />
                      <span style={{background:"#ffbd2e"}} />
                      <span style={{background:"#28c840"}} />
                    </div>
                    <span style={{fontFamily:"var(--ff-m)",fontSize:".72rem",color:"#3a6080"}}>
                      sciencefair.app / system.log — {filtered.length} events
                    </span>
                    <span style={{fontFamily:"var(--ff-m)",fontSize:".68rem",color:"#3a6080"}}>click row to expand payload</span>
                  </div>
                  <div className="it-body">
                    {filtered.length === 0 && (
                      <div className="it-empty">No {itFilter} events recorded.</div>
                    )}
                    {filtered.map(e => (
                      <div key={e.id}>
                        <div className={`it-row ${itExpanded[e.id]?"expanded":""}`} onClick={()=>toggleItRow(e.id)}>
                          <span className="it-ts">{fmtISO(e.ts)}</span>
                          <span className={`it-lvl ${e.level}`}>{e.level}</span>
                          <span className="it-mod">[{e.module}]</span>
                          <span className="it-msg"><strong>{e.event}</strong> — {e.detail}</span>
                        </div>
                        {itExpanded[e.id] && (
                          <div style={{padding:"0 1rem .5rem",background:"#0a1a2a"}}>
                            <div style={{fontFamily:"var(--ff-m)",fontSize:".68rem",color:"#3a6080",marginBottom:".25rem"}}>
                              EVENT ID: {e.id}
                            </div>
                            <div className="it-payload">{JSON.stringify(e.payload, null, 2)}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* System snapshot */}
                <div className="card" style={{marginTop:"1.25rem",background:"var(--bg)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".75rem",flexWrap:"wrap",gap:".5rem"}}>
                    <div>
                      <div style={{fontFamily:"var(--ff-d)",fontSize:".95rem",marginBottom:".15rem"}}>📸 System Snapshot</div>
                      <div style={{fontSize:".76rem",color:"var(--dim)"}}>Current live state — paste into AI to diagnose issues</div>
                    </div>
                    <button className={`copy-report-btn ${snapCopied?"done":""}`} onClick={handleCopySnapshot}>
                      {snapCopied ? "✓ Copied!" : "📋 Copy Snapshot"}
                    </button>
                  </div>
                  <div className="snap-box">{buildSnapshot()}</div>
                </div>

                {/* How to use */}
                <div className="card sec-notes" style={{background:"var(--bg)"}}>
                  <div style={{fontFamily:"var(--ff-d)",fontSize:".95rem",marginBottom:".75rem"}}>💡 How to use with AI</div>
                  <div>1. Filter by <strong>ERROR</strong> or <strong>WARN</strong> to isolate the issue.</div>
                  <div>2. Click <strong>Copy Full Report</strong> — it includes the system state + all log entries.</div>
                  <div>3. Paste into Claude or any AI with: <em style={{color:"var(--gold)"}}>"Here is my science fair app diagnostic report. What is causing the issue and how do I fix it?"</em></div>
                  <div>4. For live state issues, use <strong>Copy Snapshot</strong> to share the current data state.</div>
                </div>

                {/* Clear button */}
                <button className="btn danger sm" style={{width:"auto",marginTop:".5rem"}}
                  onClick={() => { setItLogs([]); addItLog("INFO","ADMIN","LOGS_CLEARED","IT logs cleared by admin",{ clearedAt:fmtISO(Date.now()), count: itLogs.length }); }}>
                  🗑 Clear All IT Logs
                </button>
              </>;
            })()}

          </div>
        </div>
      </div>
    );
  }

  /* PUBLIC RESULTS */
  if (view === "public-results") {
    const ranked   = rankedProjects();
    const scored   = ranked.filter(p => p.avg);
    const unscored = ranked.filter(p => !p.avg);
    const top3     = scored.slice(0, 3);
    const rest     = scored.slice(3);
    const podCols  = ["var(--gold)","#94a3b8","#cd7c3e"];

    return (
      <div className="app"><style>{CSS}</style>
        <div className="glow purple" />
        <div className="pub-wrap">
          <div className="pub-inner">

            {/* Hero */}
            <div className="pub-hero">
              <div style={{fontSize:"3.5rem",marginBottom:".5rem"}}>🏆</div>
              <h1>{shareTitle || "Science Fair 2025 — Final Results"}</h1>
              <p>Final rankings · {judges.length} judges · {totalScored()} evaluations</p>
              <div className="live-chip">● RESULTS PUBLISHED · {shareCreated ? fmtFull(shareCreated) : "Today"}</div>
            </div>

            {/* Podium */}
            {top3.length > 0 && (
              <div className="podium-wrap">
                {[top3[1], top3[0], top3[2]].filter(Boolean).map((p, vi) => {
                  const ri = p===top3[0]?0:p===top3[1]?1:2;
                  return (
                    <div key={p.id} className={`podium-card p${ri+1}`}
                      style={{ width:ri===0?"200px":"168px", order:[1,0,2][vi] }}>
                      <div className="p-medal">{MEDALS[ri]}</div>
                      <div className="p-score" style={{color:podCols[ri]}}>{p.avg}</div>
                      <div style={{fontSize:".65rem",color:"var(--dim)",marginTop:".1rem"}}>/100 pts</div>
                      <div className="p-title">{p.title}</div>
                      <div className="p-cat"><span className="badge bb">{p.cat}</span></div>
                      <div className="p-revs">{p.revs} review{p.revs!==1?"s":""}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full ranked table */}
            <div style={{marginBottom:".75rem",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:".5rem"}}>
              <div style={{fontFamily:"var(--ff-d)",fontSize:"1.1rem"}}>All Projects</div>
              <span className="badge bg">{scored.length} scored · {unscored.length} pending</span>
            </div>
            <div className="results-table">
              {scored.map((p, i) => (
                <div key={p.id} className="res-row">
                  <div className="res-rank">
                    {i < 3 ? MEDALS[i] : <span>{i+1}</span>}
                  </div>
                  <div>
                    <div className="res-title">{p.title}</div>
                    <div className="res-meta">{p.cat} · Grade {p.grade} · {p.revs} review{p.revs!==1?"s":""}</div>
                    {shareShowRubric && (
                      <div className="rub-chips">
                        {RUBRIC.map(r => {
                          const avg = rubAvg(p.id, r.id);
                          if (!avg) return null;
                          return <span key={r.id} className="rub-chip">{r.label.split(" ")[0]}: {avg}/{r.max}</span>;
                        })}
                      </div>
                    )}
                  </div>
                  <div className="res-score">
                    <div className="res-score-big">{p.avg}</div>
                    <div className="res-score-sub">/100</div>
                  </div>
                </div>
              ))}
              {unscored.map(p => (
                <div key={p.id} className="res-row" style={{opacity:.35}}>
                  <div className="res-rank">—</div>
                  <div>
                    <div className="res-title">{p.title}</div>
                    <div className="res-meta">{p.cat} · Grade {p.grade} · Awaiting scores</div>
                  </div>
                  <div className="res-score"><div style={{fontFamily:"var(--ff-m)",color:"var(--dim)",fontSize:".85rem"}}>TBD</div></div>
                </div>
              ))}
            </div>

            <div className="pub-footer">
              <strong>{shareTitle || "Science Fair 2025"}</strong><br />
              Scores are final averages across all assigned judges.<br />
              All judge identities remain anonymous.
            </div>

            {/* Admin back button (preview only) */}
            <div style={{textAlign:"center",paddingBottom:"2rem"}}>
              <button className="btn sec sm" style={{width:"auto"}} onClick={() => setView("admin-home")}>← Back to Admin</button>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return null;
}
