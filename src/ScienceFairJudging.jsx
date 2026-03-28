import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ─────────────────────────────────────────────
// CONSTANTS & MOCK DATA
// ─────────────────────────────────────────────
const INVITE_CODE  = import.meta.env.VITE_INVITE_CODE;
const ADMIN_PASS   = import.meta.env.VITE_ADMIN_PASS;
const IT_PIN       = import.meta.env.VITE_IT_PIN;
const JUDGE_NAMES  = Array.from({ length: 100 }, (_, i) => `Judge${i + 1}`);


const RUBRIC = [
  { id:"presentation", label:"Presentation",          desc:"Display Board and Project Data Book: Elements are aesthetically pleasing, organized, and creative. Is the information easy to understand?",                                                                                      max:6, steps:[0,2,4,6] },
  { id:"testable_q",   label:"Testable Question",     desc:"References a cause and effect relationship and a measurable change.",                                                                                                                                                           max:3, steps:[0,1,2,3] },
  { id:"background",   label:"Background Research",   desc:"Is diverse; multiple sources are cited and are complete.",                                                                                                                                                                     max:3, steps:[0,1,2,3] },
  { id:"hypothesis",   label:"Hypothesis",            desc:"Is based on background research.",                                                                                                                                                                                             max:3, steps:[0,1,2,3] },
  { id:"variables",    label:"Variables",             desc:"Are clearly defined (independent, controlled, dependent); may be worded as \"what I changed\", \"what I kept the same\", and \"what I measured\".",                                                                            max:3, steps:[0,1,2,3] },
  { id:"materials",    label:"Materials & Procedure", desc:"Materials are appropriate and a detailed list is given. Procedure is sequential and describes the investigation clearly and was repeated a minimum of 3 times.",                                                                max:3, steps:[0,1,2,3] },
  { id:"data",         label:"Quantitative & Qualitative Data", desc:"Quantitative Data: numbers, standard metric units, scale made up by the student. Qualitative Data: words, descriptions of physical or behavioral changes.",                                                                    max:6, steps:[0,2,4,6] },
  { id:"analysis",     label:"Analysis",              desc:"Describes the trends or patterns found in the data; may have comments on reasons for trends or patterns.",                                                                                                                      max:6, steps:[0,2,4,6] },
  { id:"conclusion",   label:"Conclusion",            desc:"Based on the analysis of the data; acceptance or rejection of hypothesis or success of solution/invention; suggestions for further efforts.",                                                                                   max:3, steps:[0,1,2,3] },
  { id:"abstract",     label:"Abstract",              desc:"Required for projects 5th–High School. Concisely sums up the project explaining the test, the outcome, and the conclusion. Not to exceed 250 words.",                                                                          max:6, steps:[0,2,4,6] },
];
/// Scoring guide: 0=not present, 1/2=partial, 2/4=complete, 3/6=exceptional

const DEFAULT_PROJECTS = [
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

const RECOMMENDATIONS = ["Recommend for Award","Strong Contender","Good Work","Needs Improvement"];
const AWARD_OPTIONS   = ["1st Place","2nd Place","3rd Place","Honorable Mention","Best in Category","No Award","Pending"];

const CATEGORIES = ["Biology","Physics","Computer Sci.","Chemistry","Earth Science","Engineering","Math","Environmental Sci."];

function uid()      { return Math.random().toString(36).slice(2, 10); }
function genToken() { return Array.from({length:4}, () => Math.random().toString(36).slice(2,6).toUpperCase()).join("-"); }
function fmt(ts)    { return new Date(ts).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }
function fmtFull(ts){ return new Date(ts).toLocaleString([], { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }); }
function fmtISO(ts) { return new Date(ts).toISOString(); }
function itId()     { return "EVT-" + Math.random().toString(36).slice(2,8).toUpperCase(); }
function getDivision(grade) {
  const g = parseInt(grade) || 0;
  if (g <= 2)  return "K-2";
  if (g <= 4)  return "3-4";
  if (g <= 6)  return "5-6";
  if (g <= 8)  return "7-8";
  return "HS";
}
function requiresAbstract(proj) { return (parseInt(proj?.grade) || 0) >= 5; }

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
  "j_a_p1":{ presentation:4,testable_q:3,background:2,hypothesis:2,variables:3,materials:3,data:4,analysis:4,conclusion:3,abstract:4, notes:"Excellent methodology.", time:Date.now()-3000000 },
  "j_a_p2":{ presentation:4,testable_q:2,background:2,hypothesis:2,variables:2,materials:2,data:4,analysis:4,conclusion:2,abstract:2, notes:"Good work.",             time:Date.now()-2700000 },
  "j_b_p3":{ presentation:6,testable_q:3,background:3,hypothesis:3,variables:3,materials:3,data:6,analysis:6,conclusion:3,abstract:6, notes:"Impressive ML work.",    time:Date.now()-2000000 },
  "j_b_p4":{ presentation:4,testable_q:2,background:2,hypothesis:2,variables:2,materials:2,data:4,analysis:4,conclusion:2,abstract:4, notes:"Creative concept.",      time:Date.now()-1700000 },
  "j_c_p5":{ presentation:4,testable_q:2,background:2,hypothesis:2,variables:3,materials:3,data:4,analysis:4,conclusion:2,abstract:4, notes:"Solid research.",        time:Date.now()-1200000 },
  "j_c_p6":{ presentation:6,testable_q:3,background:3,hypothesis:3,variables:3,materials:3,data:6,analysis:6,conclusion:3,abstract:6, notes:"Outstanding project.",   time:Date.now()-900000  },
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
  @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&family=Source+Sans+3:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  :root{
    --bg:#ffffff;--s1:#f8fafc;--s2:#f1f5f9;--bd:#e2e8f0;
    --navy:#1e3a5f;--navy-l:#2d5a8e;
    --text:#1e293b;--dim:#64748b;
    --green:#059669;--green-l:#d1fae5;--red:#dc2626;--red-l:#fee2e2;--amber:#d97706;--amber-l:#fef3c7;
    --blue:#2563eb;--blue-l:#dbeafe;--purple:#7c3aed;--purple-l:#ede9fe;
    --r:12px;
    --ff-d:'Merriweather',Georgia,serif;
    --ff-b:'Source Sans 3','Source Sans Pro',sans-serif;
    --ff-m:'DM Mono',monospace;
    --shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
    --shadow-md:0 4px 12px rgba(0,0,0,.07),0 2px 4px rgba(0,0,0,.04);
    --shadow-lg:0 10px 30px rgba(0,0,0,.08),0 4px 8px rgba(0,0,0,.04);
  }
  body{background:var(--bg);color:var(--text);font-family:var(--ff-b);font-size:16px;line-height:1.6;overflow-x:hidden;}
  #root{min-height:100vh;position:relative;isolation:isolate;}
  #root::before{
    content:"";
    position:fixed;
    inset:0;
    z-index:-3;
    pointer-events:none;
    background:
      radial-gradient(1200px 800px at 8% -18%, #bfdbfe 0%, transparent 62%),
      radial-gradient(1000px 680px at 96% 8%, #bae6fd 0%, transparent 60%),
      linear-gradient(135deg, #edf7ff 0%, #e6f1ff 42%, #f8fbff 100%);
    animation:bgShift 18s ease-in-out infinite alternate;
  }
  .app{min-height:100vh;position:relative;z-index:1;isolation:isolate;}
  @keyframes bgShift {
    0% {
      transform: translate3d(0,0,0) scale(1);
      filter: saturate(1);
    }
    100% {
      transform: translate3d(0,-14px,0) scale(1.025);
      filter: saturate(1.08);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    #root::before{animation:none;}
  }
  .center{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem;}
  .inner{width:100%;max-width:580px;}

  /* LANDING */
  .glow{position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:700px;height:500px;
    background:radial-gradient(ellipse at 50% 0%,#1e3a5f10 0%,transparent 70%);pointer-events:none;}
  .glow.purple{background:radial-gradient(ellipse at 50% 0%,#1e3a5f08 0%,transparent 70%);}
  .school-banner{display:flex;flex-direction:column;align-items:center;gap:.6rem;margin-bottom:2rem;}
  .school-banner img{width:88px;height:88px;object-fit:contain;filter:drop-shadow(0 4px 12px rgba(30,58,95,.15));}
  .school-name{font-family:var(--ff-d);font-size:clamp(1rem,3.5vw,1.25rem);font-weight:700;
    color:var(--navy);text-align:center;letter-spacing:.01em;line-height:1.25;}
  .school-name span{color:var(--navy-l);}
  .school-div{width:48px;height:2px;background:linear-gradient(90deg,transparent,var(--navy),transparent);margin:.2rem 0;}
  .land-badge{font-family:var(--ff-m);font-size:.75rem;letter-spacing:.15em;color:var(--navy);
    border:1px solid var(--bd);border-radius:100px;padding:.35rem 1.1rem;margin-bottom:2rem;display:inline-block;
    background:var(--s1);}
  .land-h1{font-family:var(--ff-d);font-size:clamp(2rem,6vw,3.2rem);font-weight:900;text-align:center;
    line-height:1.15;margin-bottom:.9rem;color:var(--navy);}
  .land-h1 span{color:var(--green);}
  .land-p{color:var(--dim);text-align:center;max-width:420px;line-height:1.7;margin-bottom:3rem;font-size:1.05rem;}
  .role-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;width:100%;max-width:500px;}
  .role-grid.three{grid-template-columns:1fr 1fr;}
  @media(max-width:440px){.role-grid{grid-template-columns:1fr;}}
  .role-card{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.75rem 1.5rem;
    cursor:pointer;transition:all .2s;text-align:center;box-shadow:var(--shadow);}
  .role-card:hover{border-color:var(--navy);transform:translateY(-2px);box-shadow:var(--shadow-lg);}
  .role-card.adm:hover{border-color:var(--navy);}
  .role-card.pub{grid-column:span 2;display:flex;align-items:center;gap:1.5rem;text-align:left;
    background:linear-gradient(135deg,#f0fdf4 0%,#ffffff 60%);border-color:var(--green);}
  .role-card.pub:hover{border-color:var(--green);box-shadow:var(--shadow-lg);}
  .role-card.pub .ico{font-size:3rem;flex-shrink:0;}
  .role-card .ico{font-size:2.4rem;margin-bottom:.65rem;}
  .role-card h3{font-size:1.1rem;font-weight:700;margin-bottom:.25rem;color:var(--navy);}
  .role-card p{font-size:.9rem;color:var(--dim);}
  .pub-pill{display:inline-flex;align-items:center;gap:.35rem;background:var(--green-l);border:1px solid #05966930;
    color:var(--green);font-size:.75rem;font-family:var(--ff-m);padding:.25rem .7rem;border-radius:100px;margin-bottom:.3rem;}
  .demo-hint{margin-top:2rem;font-size:.8rem;color:var(--dim);text-align:center;}
  .demo-hint strong{color:var(--navy);font-family:var(--ff-m);}

  /* SHARED */
  .back{background:none;border:none;color:var(--dim);cursor:pointer;font-family:var(--ff-b);
    font-size:.95rem;margin-bottom:1.5rem;padding:0;display:flex;align-items:center;gap:.3rem;}
  .back:hover{color:var(--text);}
  .card{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.5rem;
    margin-bottom:.85rem;box-shadow:var(--shadow);}
  .lbl{font-size:.8rem;font-family:var(--ff-m);letter-spacing:.08em;color:var(--dim);text-transform:uppercase;margin-bottom:.5rem;}
  input[type=text],input[type=password]{width:100%;background:var(--bg);border:1.5px solid var(--bd);
    border-radius:8px;padding:.85rem 1rem;color:var(--text);font-family:var(--ff-b);font-size:1.05rem;outline:none;transition:border-color .2s;}
  input[type=text]:read-only{color:var(--navy);font-family:var(--ff-m);font-size:.9rem;letter-spacing:.03em;cursor:default;background:var(--s1);}
  input:focus{border-color:var(--navy);}
  .err{color:var(--red);font-size:.9rem;margin-top:.4rem;}
  textarea{width:100%;background:var(--bg);border:1.5px solid var(--bd);border-radius:8px;
    padding:.85rem 1rem;color:var(--text);font-family:var(--ff-b);font-size:1rem;
    outline:none;resize:vertical;min-height:90px;transition:border-color .2s;}
  textarea:focus{border-color:var(--navy);}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;background:var(--navy);
    color:#fff;border:none;border-radius:8px;padding:.9rem 1.5rem;font-family:var(--ff-b);
    font-size:1rem;font-weight:600;cursor:pointer;transition:all .2s;width:100%;box-shadow:var(--shadow);}
  .btn:hover{background:var(--navy-l);box-shadow:var(--shadow-md);}
  .btn:disabled{opacity:.4;cursor:not-allowed;}
  .btn.sec{background:var(--bg);color:var(--text);border:1.5px solid var(--bd);box-shadow:none;}
  .btn.sec:hover{border-color:var(--dim);background:var(--s1);}
  .btn.purple{background:var(--purple);color:#fff;}
  .btn.purple:hover{background:#6d28d9;}
  .btn.danger{background:var(--red);color:#fff;}
  .btn.danger:hover{background:#b91c1c;}
  .btn.sm{width:auto;padding:.5rem 1rem;font-size:.9rem;}
  .btn-row{display:flex;gap:.6rem;flex-wrap:wrap;}
  .pbar{background:var(--bd);border-radius:100px;overflow:hidden;}
  .pfill{background:linear-gradient(90deg,var(--green),#34d399);border-radius:100px;transition:width .5s ease;}
  .badge{display:inline-block;font-size:.75rem;font-family:var(--ff-m);padding:.25rem .7rem;border-radius:100px;font-weight:500;}
  .bg{background:var(--green-l);color:var(--green);}
  .ba{background:var(--amber-l);color:var(--amber);}
  .br{background:var(--red-l);color:var(--red);}
  .bb{background:var(--blue-l);color:var(--blue);}
  .bp{background:var(--purple-l);color:var(--purple);}

  /* TOGGLE */
  .toggle-wrap{display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;}
  .toggle{position:relative;width:48px;height:26px;flex-shrink:0;}
  .toggle input{opacity:0;width:0;height:0;}
  .toggle-slider{position:absolute;inset:0;background:var(--bd);border-radius:100px;cursor:pointer;transition:.2s;}
  .toggle-slider:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;
    background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.15);}
  .toggle input:checked + .toggle-slider{background:var(--green);}
  .toggle input:checked + .toggle-slider:before{transform:translateX(22px);}

  /* JUDGE */
  .jh-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;}
  .alias-tag{font-family:var(--ff-m);font-size:.82rem;background:var(--s1);border:1px solid var(--bd);
    color:var(--navy);padding:.35rem .9rem;border-radius:100px;font-weight:500;}
  .proj-list{padding:.25rem;}
  .proj-item{display:flex;align-items:center;gap:1rem;padding:1rem .85rem;border-radius:10px;
    cursor:pointer;transition:all .15s;border:1px solid transparent;}
  .proj-item:hover{background:var(--s1);border-color:var(--bd);}
  .proj-num{font-family:var(--ff-m);font-size:.8rem;color:var(--navy);min-width:38px;font-weight:500;}
  .proj-info{flex:1;}
  .proj-title{font-size:1rem;font-weight:600;margin-bottom:.2rem;line-height:1.35;color:var(--text);}
  .proj-meta{font-size:.85rem;color:var(--dim);}
  .proj-st{font-size:.8rem;font-family:var(--ff-m);padding:.25rem .65rem;border-radius:100px;white-space:nowrap;}
  .st-done{background:var(--green-l);color:var(--green);}
  .st-pend{background:var(--s2);color:var(--dim);}
  .locked-banner{background:var(--red-l);border:1px solid #dc262630;border-radius:10px;padding:.8rem 1.1rem;
    text-align:center;font-size:.95rem;color:var(--red);margin-bottom:1rem;font-weight:500;}
  .offline-banner{background:var(--amber-l);border:1px solid #d9770630;border-radius:10px;padding:.7rem 1.1rem;
    display:flex;align-items:center;gap:.5rem;font-size:.88rem;color:var(--amber);margin-bottom:.85rem;font-weight:500;flex-wrap:wrap;}
  .offline-banner .sync-ct{font-family:var(--ff-m);font-size:.75rem;margin-left:.25rem;opacity:.8;}
  .sync-banner{background:#fff7ed;border:1px solid #fb923c55;border-radius:10px;padding:.7rem 1.1rem;
    display:flex;align-items:center;justify-content:space-between;gap:.7rem;font-size:.86rem;color:#9a3412;margin-bottom:.85rem;flex-wrap:wrap;}
  .sync-meta{font-size:.78rem;color:var(--dim);font-family:var(--ff-m);}
  .all-done{background:var(--green-l);border:1px solid #05966920;border-radius:var(--r);padding:1.5rem;text-align:center;}

  /* SCORING */
  .sc-header{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.35rem 1.5rem;
    margin-bottom:1rem;box-shadow:var(--shadow);}
  .sc-header h2{font-family:var(--ff-d);font-size:1.35rem;margin-bottom:.4rem;line-height:1.25;color:var(--navy);}
  .rub-item{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.3rem 1.5rem;
    margin-bottom:.75rem;box-shadow:var(--shadow);}
  .rub-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.3rem;}
  .rub-lbl{font-weight:700;font-size:1rem;color:var(--text);}
  .rub-val{font-family:var(--ff-m);font-size:1.1rem;color:var(--navy);white-space:nowrap;font-weight:500;}
  .rub-desc{font-size:.88rem;color:var(--dim);margin-bottom:.85rem;line-height:1.5;}
  .rub-steps{display:flex;gap:.6rem;margin-top:.5rem;}
  .rub-step-btn{flex:1;padding:.65rem 0;border:2px solid var(--bd);border-radius:8px;background:var(--s1);
    color:var(--dim);font-family:var(--ff-m);font-size:1.1rem;font-weight:600;cursor:pointer;transition:.15s;}
  .rub-step-btn:hover{border-color:var(--navy);color:var(--text);}
  .rub-step-btn.selected{background:var(--navy);border-color:var(--navy);color:#fff;box-shadow:0 2px 8px rgba(30,58,95,.35);}
  .rub-step-btn.selected:hover{background:var(--navy-l);}
  .sc-total{display:flex;align-items:center;justify-content:space-between;
    background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.1rem 1.5rem;
    margin-bottom:.85rem;box-shadow:var(--shadow);}
  .sc-total-num{font-family:var(--ff-d);font-size:2.4rem;font-weight:900;color:var(--navy);}

  /* ADMIN */
  .admin-wrap{display:grid;grid-template-columns:220px 1fr;min-height:100vh;}
  @media(max-width:740px){.admin-wrap{grid-template-columns:1fr;}}
  .adm-side{background:var(--navy);border-right:none;padding:1.5rem 1rem;
    position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:.25rem;overflow-y:auto;}
  @media(max-width:740px){.adm-side{height:auto;position:static;flex-direction:row;flex-wrap:wrap;align-items:center;padding:1rem;gap:.4rem;}}
  .adm-brand{font-family:var(--ff-d);font-size:1.15rem;color:#fff;margin-bottom:1.5rem;font-weight:700;}
  @media(max-width:740px){.adm-brand{margin:0;flex:1;}}
  .nav-it{display:flex;align-items:center;gap:.6rem;padding:.65rem .9rem;border-radius:8px;
    cursor:pointer;font-size:.92rem;color:rgba(255,255,255,.65);transition:all .15s;border:1px solid transparent;}
  .nav-it:hover{background:rgba(255,255,255,.1);color:#fff;}
  .nav-it.act{background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.1);}
  .adm-main{padding:2rem;overflow-y:auto;background:var(--s1);}
  @media(max-width:480px){.adm-main{padding:1rem;}}
  .adm-h1{font-family:var(--ff-d);font-size:1.6rem;margin-bottom:.25rem;color:var(--navy);}
  .adm-sub{color:var(--dim);font-size:.92rem;margin-bottom:1.75rem;}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.85rem;margin-bottom:1.75rem;}
  .stat-card{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.3rem;box-shadow:var(--shadow);}
  .stat-v{font-family:var(--ff-d);font-size:2rem;font-weight:900;line-height:1;margin-bottom:.25rem;}
  .stat-l{font-size:.78rem;color:var(--dim);font-family:var(--ff-m);}
  .sec-title{font-family:var(--ff-d);font-size:1.15rem;margin-bottom:1rem;color:var(--navy);}
  .tbl-wrap{overflow-x:auto;}
  table{width:100%;border-collapse:collapse;font-size:.95rem;}
  th{font-family:var(--ff-m);font-size:.75rem;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;
    padding:.6rem 1rem;border-bottom:2px solid var(--bd);text-align:left;white-space:nowrap;}
  td{padding:.75rem 1rem;border-bottom:1px solid var(--bd);vertical-align:middle;}
  tr:last-child td{border-bottom:none;}
  tr:hover td{background:var(--s1);}
  .log-row{display:flex;align-items:flex-start;gap:.9rem;padding:.7rem 0;border-bottom:1px solid var(--bd);font-size:.95rem;}
  .log-t{font-family:var(--ff-m);color:var(--dim);font-size:.8rem;white-space:nowrap;min-width:60px;}
  .alert-box{display:flex;align-items:flex-start;gap:.85rem;background:var(--amber-l);border:1px solid #d9770630;
    border-radius:10px;padding:1.1rem 1.3rem;margin-bottom:.7rem;}
  .alert-ico{font-size:1.3rem;flex-shrink:0;margin-top:.1rem;}
  .alert-msg strong{display:block;margin-bottom:.25rem;font-size:.95rem;color:var(--text);}
  .alert-msg span{font-size:.9rem;color:var(--dim);}
  .sys-row{display:flex;align-items:center;justify-content:space-between;padding:.7rem 0;border-bottom:1px solid var(--bd);font-size:.95rem;}
  .sys-row:last-child{border:none;}

  /* SHARE */
  .share-status{display:flex;align-items:center;gap:.65rem;padding:1.1rem 1.3rem;border-radius:10px;margin-bottom:1.2rem;}
  .share-status.on{background:var(--green-l);border:1px solid #05966930;color:var(--green);}
  .share-status.off{background:var(--s1);border:1px solid var(--bd);color:var(--dim);}
  .link-box{display:flex;gap:.5rem;align-items:stretch;}
  .link-box input{flex:1;}
  .copy-btn{background:var(--s1);border:1.5px solid var(--bd);border-radius:8px;padding:.75rem 1rem;
    color:var(--text);cursor:pointer;font-size:.9rem;white-space:nowrap;transition:all .15s;font-family:var(--ff-b);}
  .copy-btn:hover{border-color:var(--navy);color:var(--navy);}
  .copy-btn.copied{border-color:var(--green);color:var(--green);}
  .token-pill{display:inline-flex;align-items:center;gap:.35rem;background:var(--purple-l);border:1px solid #7c3aed30;
    color:var(--purple);font-family:var(--ff-m);font-size:.82rem;padding:.35rem .85rem;border-radius:100px;}
  .expiry-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem;}
  .expiry-opt{padding:.5rem 1rem;border-radius:8px;border:1.5px solid var(--bd);background:var(--bg);
    color:var(--dim);font-size:.9rem;cursor:pointer;transition:all .15s;}
  .expiry-opt:hover{border-color:var(--navy);color:var(--text);}
  .expiry-opt.sel{border-color:var(--navy);color:var(--navy);background:#1e3a5f08;font-weight:600;}
  .sec-notes div{font-size:.9rem;color:var(--dim);line-height:1.8;}
  .sec-notes strong{color:var(--text);}

  /* PUBLIC RESULTS */
  .pub-wrap{min-height:100vh;padding:2rem 1rem 3rem;background:linear-gradient(180deg,var(--s1) 0%,var(--bg) 30%);}
  .pub-inner{max-width:780px;margin:0 auto;}
  .pub-hero{text-align:center;padding:2.5rem 1rem 1.5rem;position:relative;}
  .pub-hero h1{font-family:var(--ff-d);font-size:clamp(1.8rem,5vw,2.8rem);margin-bottom:.5rem;line-height:1.2;color:var(--navy);}
  .pub-hero p{color:var(--dim);font-size:.95rem;margin-top:.3rem;}
  .live-chip{display:inline-flex;align-items:center;gap:.4rem;background:var(--green-l);border:1px solid #05966920;
    color:var(--green);font-size:.78rem;font-family:var(--ff-m);padding:.35rem .9rem;border-radius:100px;margin-top:.75rem;}
  .podium-wrap{display:flex;align-items:flex-end;justify-content:center;gap:.85rem;margin:2rem 0 2.5rem;flex-wrap:wrap;}
  .podium-card{background:var(--bg);border:1px solid var(--bd);border-radius:16px;padding:1.5rem 1.25rem;text-align:center;
    transition:transform .2s,box-shadow .2s;cursor:default;box-shadow:var(--shadow-md);}
  .podium-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg);}
  .podium-card.p1{border-color:#d97706;background:linear-gradient(160deg,#fffbeb,#ffffff);
    box-shadow:0 8px 30px rgba(217,119,6,.12);}
  .podium-card.p2{border-color:#94a3b8;background:linear-gradient(160deg,#f8fafc,#ffffff);}
  .podium-card.p3{border-color:#b45309;background:linear-gradient(160deg,#fffbeb,#ffffff);}
  .p-medal{font-size:2.5rem;margin-bottom:.4rem;}
  .p-score{font-family:var(--ff-d);font-size:2.4rem;font-weight:900;}
  .p-title{font-size:.85rem;color:var(--dim);margin-top:.4rem;line-height:1.4;max-width:150px;margin-inline:auto;}
  .p-cat{margin-top:.5rem;}
  .p-revs{font-size:.78rem;color:var(--dim);margin-top:.25rem;}
  .results-table{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;
    margin-bottom:1.5rem;box-shadow:var(--shadow);}
  .res-row{display:grid;grid-template-columns:50px 1fr auto;align-items:center;gap:1rem;padding:1.1rem 1.35rem;
    border-bottom:1px solid var(--bd);transition:background .15s;}
  .res-row:last-child{border:none;}
  .res-row:hover{background:var(--s1);}
  .res-rank{font-family:var(--ff-m);font-size:.88rem;color:var(--dim);text-align:center;font-weight:500;}
  .res-title{font-size:1rem;font-weight:600;margin-bottom:.2rem;line-height:1.35;color:var(--text);}
  .res-meta{font-size:.82rem;color:var(--dim);margin-bottom:.4rem;}
  .rub-chips{display:flex;gap:.35rem;flex-wrap:wrap;}
  .rub-chip{font-size:.72rem;font-family:var(--ff-m);background:var(--s2);border:1px solid var(--bd);
    padding:.2rem .55rem;border-radius:100px;color:var(--dim);}
  .res-score{text-align:right;flex-shrink:0;}
  .res-score-big{font-family:var(--ff-d);font-size:1.8rem;color:var(--navy);font-weight:900;}
  .res-score-sub{font-size:.78rem;color:var(--dim);}
  .pub-footer{text-align:center;padding:1.5rem 1rem;font-size:.82rem;color:var(--dim);line-height:1.8;
    border-top:1px solid var(--bd);margin-top:1rem;}

  /* IT LOGS — STAYS DARK THEMED */
  .it-toolbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:1.1rem;}
  .lvl-btn{padding:.4rem .9rem;border-radius:8px;border:1px solid #1c2e4a;background:#0d1b30;
    font-family:var(--ff-m);font-size:.78rem;cursor:pointer;transition:all .15s;color:#6b7fa3;}
  .lvl-btn:hover{border-color:#a37010;color:#e2e8f5;}
  .lvl-btn.f-ALL{border-color:#e2e8f5;color:#e2e8f5;}
  .lvl-btn.f-ERROR{border-color:#ef4444;color:#ef4444;background:#3a1010;}
  .lvl-btn.f-WARN{border-color:#f59e0b;color:#f59e0b;background:#382a0a;}
  .lvl-btn.f-INFO{border-color:#60a5fa;color:#60a5fa;background:#102040;}
  .lvl-btn.f-DEBUG{border-color:#a78bfa;color:#a78bfa;background:#2d1b69;}
  .it-term{background:#020c16;border:1px solid #0e2235;border-radius:var(--r);overflow:hidden;font-family:var(--ff-m);}
  .it-term-head{display:flex;align-items:center;justify-content:space-between;padding:.6rem 1rem;
    background:#040f1c;border-bottom:1px solid #0e2235;gap:.75rem;flex-wrap:wrap;}
  .it-term-dots{display:flex;gap:.4rem;}
  .it-term-dots span{width:10px;height:10px;border-radius:50%;display:inline-block;}
  .it-body{max-height:520px;overflow-y:auto;padding:.5rem 0;}
  .it-row{display:grid;grid-template-columns:200px 54px 70px 1fr;gap:.5rem 1rem;
    padding:.5rem 1rem;border-bottom:1px solid #0e2235;font-size:.8rem;align-items:start;cursor:pointer;transition:background .1s;}
  .it-row:last-child{border:none;}
  .it-row:hover{background:#0a1a2a;}
  .it-row.expanded{background:#0a1a2a;}
  .it-ts{color:#3a6080;white-space:nowrap;font-size:.74rem;}
  .it-lvl{font-weight:500;text-align:center;}
  .it-lvl.ERROR{color:#ef4444;}
  .it-lvl.WARN{color:#f59e0b;}
  .it-lvl.INFO{color:#60a5fa;}
  .it-lvl.DEBUG{color:#a78bfa;}
  .it-mod{color:#3a8060;font-size:.74rem;}
  .it-msg{color:#9ab8cc;}
  .it-msg strong{color:#cde;font-weight:500;}
  .it-payload{grid-column:1/-1;background:#030d18;border:1px solid #0e2235;border-radius:8px;
    padding:.7rem 1rem;margin:.2rem 0 .3rem;font-size:.78rem;color:#7aa0b8;white-space:pre-wrap;
    word-break:break-all;line-height:1.65;}
  .it-empty{text-align:center;padding:3rem 1rem;color:#3a6080;font-size:.88rem;}
  .copy-report-btn{display:flex;align-items:center;gap:.4rem;background:#0a1a2a;border:1px solid #0e2235;
    border-radius:8px;padding:.5rem 1rem;color:#60a5fa;font-family:var(--ff-m);font-size:.78rem;
    cursor:pointer;transition:all .15s;white-space:nowrap;}
  .copy-report-btn:hover{border-color:#3b82f6;background:#0d2035;}
  .copy-report-btn.done{border-color:#22c55e;color:#22c55e;}
  .it-count{font-family:var(--ff-m);font-size:.78rem;color:#6b7fa3;}
  .snap-box{background:#020c16;border:1px solid #0e2235;border-radius:var(--r);padding:1.1rem 1.25rem;
    margin-bottom:1rem;font-family:var(--ff-m);font-size:.78rem;color:#7aa0b8;white-space:pre-wrap;
    line-height:1.7;max-height:240px;overflow-y:auto;}
  /* IT logs section dark wrapper */
  .it-dark-wrap{background:#07101f;color:#e2e8f5;border-radius:var(--r);padding:2rem;margin:-2rem;min-height:calc(100vh - 4rem);}
  @media(max-width:480px){.it-dark-wrap{padding:1rem;margin:-1rem;}}

  /* IT PIN GATE */
  .pin-gate{display:flex;flex-direction:column;align-items:center;justify-content:center;
    min-height:340px;text-align:center;padding:2rem;}
  .pin-gate .ico{font-size:3rem;margin-bottom:1rem;}
  .pin-gate h2{font-family:var(--ff-d);font-size:1.5rem;margin-bottom:.4rem;color:var(--navy);}
  .pin-gate p{color:var(--dim);font-size:.92rem;margin-bottom:1.75rem;max-width:340px;}
  .pin-dots{display:flex;gap:.7rem;justify-content:center;margin-bottom:1.25rem;}
  .pin-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--bd);
    background:var(--bg);transition:all .2s;}
  .pin-dot.filled{background:var(--navy);border-color:var(--navy);box-shadow:0 0 8px rgba(30,58,95,.3);}
  .pin-input-wrap{position:relative;width:200px;}
  .pin-input-wrap input[type=password]{
    text-align:center;letter-spacing:.5em;font-family:var(--ff-m);font-size:1.4rem;
    border-color:var(--bd);padding:1rem 1rem;}
  .pin-input-wrap input[type=password]:focus{border-color:var(--navy);}
  .pin-err{color:var(--red);font-size:.88rem;margin-top:.5rem;min-height:1.2em;}
  .pin-shake{animation:shake .35s ease;}
  @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
  .it-lock-badge{display:flex;align-items:center;gap:.4rem;font-family:var(--ff-m);font-size:.75rem;
    color:#6b7fa3;background:#0d1b30;border:1px solid #1c2e4a;padding:.3rem .8rem;border-radius:100px;cursor:pointer;}
  .it-lock-badge:hover{border-color:#ef4444;color:#ef4444;}

  /* RESET MODAL */
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;z-index:999;padding:1.5rem;}
  .modal-box{background:var(--bg);border:1px solid #dc262640;border-radius:16px;
    padding:2.25rem 2rem;width:100%;max-width:440px;text-align:center;
    box-shadow:0 24px 80px rgba(220,38,38,.1);}
  .modal-box .ico{font-size:3rem;margin-bottom:.75rem;}
  .modal-box h2{font-family:var(--ff-d);font-size:1.5rem;margin-bottom:.4rem;color:var(--red);}
  .modal-box p{color:var(--dim);font-size:.92rem;line-height:1.6;margin-bottom:1.5rem;}
  .modal-box .warn-list{background:var(--red-l);border:1px solid #dc262620;border-radius:10px;
    padding:.9rem 1.1rem;margin-bottom:1.5rem;text-align:left;}
  .modal-box .warn-list div{font-size:.88rem;color:var(--red);line-height:1.8;display:flex;gap:.4rem;}
  .modal-box .warn-list div::before{content:"\\2717";color:var(--red);flex-shrink:0;}
  .modal-pin-label{font-family:var(--ff-m);font-size:.78rem;letter-spacing:.1em;color:var(--dim);
    text-transform:uppercase;margin-bottom:.6rem;}
  .modal-pin-dots{display:flex;gap:.65rem;justify-content:center;margin-bottom:.85rem;}
  .modal-pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid #dc262640;
    background:var(--bg);transition:all .2s;}
  .modal-pin-dot.filled{background:var(--red);border-color:var(--red);box-shadow:0 0 8px rgba(220,38,38,.3);}
  .modal-btn-row{display:flex;gap:.65rem;margin-top:1rem;}
  .nav-it.reset{color:#fca5a5;border-color:transparent;}
  .nav-it.reset:hover{background:rgba(220,38,38,.15);border-color:rgba(220,38,38,.3);color:#fca5a5;}

  /* DELIBERATION */
  .delib-section{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.5rem;margin-top:1rem;}
  .delib-proj{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.25rem;margin-bottom:.75rem;box-shadow:var(--shadow);}
  .delib-proj-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:.75rem;flex-wrap:wrap;}
  .delib-rec-select{width:100%;background:var(--bg);border:1.5px solid var(--bd);border-radius:8px;
    padding:.75rem 1rem;color:var(--text);font-family:var(--ff-b);font-size:.95rem;outline:none;cursor:pointer;}
  .delib-rec-select:focus{border-color:var(--navy);}
  .delib-flag-wrap{display:flex;align-items:center;gap:.6rem;margin-top:.75rem;padding:.6rem .8rem;
    background:var(--s1);border:1px solid var(--bd);border-radius:8px;cursor:pointer;transition:background .15s;}
  .delib-flag-wrap:hover{background:var(--s2);}
  .delib-flag-wrap input[type=checkbox]{width:18px;height:18px;accent-color:var(--amber);cursor:pointer;}
  .delib-submitted{display:flex;align-items:center;gap:.5rem;color:var(--green);font-size:.88rem;font-weight:500;
    padding:.6rem .8rem;background:var(--green-l);border:1px solid #05966920;border-radius:8px;}
  .delib-comment-card{background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:1rem;margin-bottom:.6rem;}
  .delib-comment-alias{font-family:var(--ff-m);font-size:.78rem;color:var(--navy);margin-bottom:.3rem;}
  .delib-comment-text{font-size:.9rem;color:var(--text);line-height:1.6;margin-bottom:.4rem;}
  .delib-comment-meta{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}
  .delib-rec-pill{display:inline-block;font-size:.72rem;font-family:var(--ff-m);padding:.2rem .6rem;border-radius:100px;}
  .delib-rec-pill.award{background:var(--green-l);color:var(--green);}
  .delib-rec-pill.strong{background:var(--blue-l);color:var(--blue);}
  .delib-rec-pill.good{background:var(--amber-l);color:var(--amber);}
  .delib-rec-pill.needs{background:var(--red-l);color:var(--red);}
  .delib-flag-badge{display:inline-flex;align-items:center;gap:.25rem;font-size:.72rem;font-family:var(--ff-m);
    background:var(--amber-l);border:1px solid #d9770630;color:var(--amber);padding:.2rem .6rem;border-radius:100px;}
  .delib-discuss{display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-family:var(--ff-m);
    background:var(--red-l);border:1px solid #dc262620;color:var(--red);padding:.3rem .7rem;border-radius:100px;}
  .delib-phase-toggle{display:flex;align-items:center;gap:1rem;padding:1rem 1.3rem;
    background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);margin-bottom:1rem;box-shadow:var(--shadow);}
  /* VALIDATION */
  .val-status-pill{display:inline-block;font-size:.75rem;font-family:var(--ff-m);font-weight:600;padding:.25rem .7rem;border-radius:100px;}
  .val-status-pill.approved{background:var(--green-l);color:var(--green);}
  .val-status-pill.concern{background:var(--amber-l);color:var(--amber);}
  .val-status-pill.pending{background:var(--s2);color:var(--dim);}
  .val-stat-pill{display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;font-family:var(--ff-m);font-weight:600;padding:.3rem .8rem;border-radius:100px;}
  .val-stat-pill.green{background:var(--green-l);color:var(--green);}
  .val-stat-pill.red{background:var(--red-l);color:var(--red);}
  .val-stat-pill.dim{background:var(--s2);color:var(--dim);}
  .val-consensus-card{padding:1rem 1.25rem;border-radius:var(--r);border:1px solid var(--bd);background:var(--s1);margin-bottom:1rem;}
  .val-consensus-card.reached{background:var(--green-l);border-color:#05966930;}
  .val-tie-alert{display:flex;align-items:center;gap:.75rem;padding:.9rem 1.1rem;background:var(--amber-l);border:1px solid #d9770630;border-radius:var(--r);margin-bottom:1rem;color:var(--amber);}
  .val-finalized-banner{display:flex;align-items:center;gap:.85rem;padding:1rem 1.25rem;background:var(--green-l);border:1px solid #05966930;border-radius:var(--r);margin-bottom:1.25rem;}
  .btn.amber{background:var(--amber);color:#fff;}
  .delib-finalized{background:var(--green-l);border:1px solid #05966920;border-radius:10px;
    padding:.6rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;}
  .award-badge{display:inline-flex;align-items:center;gap:.35rem;font-family:var(--ff-m);font-size:.82rem;
    padding:.35rem .85rem;border-radius:100px;font-weight:600;}
  .award-badge.gold{background:var(--amber-l);color:var(--amber);border:1px solid #d9770630;}
  .award-badge.silver{background:var(--s2);color:var(--dim);border:1px solid var(--bd);}
  .award-badge.bronze{background:#fef3c7;color:#92400e;border:1px solid #92400e30;}
  .award-badge.hm{background:var(--purple-l);color:var(--purple);border:1px solid #7c3aed30;}
  .award-badge.best{background:var(--blue-l);color:var(--blue);border:1px solid #2563eb30;}
  .award-badge.none{background:var(--s2);color:var(--dim);border:1px solid var(--bd);}
  .award-badge.sm{font-size:.7rem;padding:.2rem .6rem;}

  /* PROJECT MANAGEMENT */
  .proj-mgmt-card{background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);padding:1.1rem 1.25rem;
    margin-bottom:.6rem;box-shadow:var(--shadow);transition:border-color .15s;}
  .proj-mgmt-card.is-locked{border-color:var(--amber);background:#fef3c705;}
  .proj-mgmt-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;}
  .proj-mgmt-actions{display:flex;gap:.35rem;flex-shrink:0;align-items:center;}
  .proj-act-btn{padding:.35rem .65rem;border-radius:6px;border:1px solid var(--bd);background:var(--bg);
    font-family:var(--ff-m);font-size:.72rem;cursor:pointer;transition:all .15s;color:var(--dim);}
  .proj-act-btn:hover{border-color:var(--navy);color:var(--navy);}
  .proj-act-btn.lock{color:var(--amber);border-color:var(--amber)30;}
  .proj-act-btn.lock:hover{background:var(--amber-l);}
  .proj-act-btn.unlock{color:var(--green);border-color:var(--green)30;}
  .proj-act-btn.unlock:hover{background:var(--green-l);}
  .proj-act-btn.edit{color:var(--blue);border-color:var(--blue)30;}
  .proj-act-btn.edit:hover{background:var(--blue-l);}
  .proj-act-btn.del{color:var(--red);border-color:var(--red)30;}
  .proj-act-btn.del:hover{background:var(--red-l);}
  .proj-form{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:1.25rem;margin-bottom:.75rem;}
  .proj-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;}
  .proj-form-grid.full{grid-template-columns:1fr;}
  .proj-lock-badge{display:inline-flex;align-items:center;gap:.25rem;font-size:.68rem;font-family:var(--ff-m);
    color:var(--amber);background:var(--amber-l);padding:.15rem .5rem;border-radius:100px;}
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
      presentation: row.presentation, testable_q: row.testable_q,
      background: row.background, hypothesis: row.hypothesis,
      variables: row.variables, materials: row.materials,
      data: row.data, analysis: row.analysis,
      conclusion: row.conclusion, abstract: row.abstract,
      notes: row.notes || "", time: new Date(row.submitted_at).getTime(),
    };
    return acc;
  }, {});
}
function delibNotesToMap(rows) {
  return rows.reduce((acc, row) => {
    acc[`${row.judge_id}_${row.project_id}`] = {
      comment: row.comment || "", recommendation: row.recommendation || "Pending",
      flagged: row.flagged || false, submittedAt: new Date(row.submitted_at).getTime(),
    };
    return acc;
  }, {});
}
function finalDecisionsToMap(rows) {
  return rows.reduce((acc, row) => {
    acc[row.project_id] = {
      award: row.award || "Pending", adminNotes: row.admin_notes || "",
      finalized: row.finalized || false,
      finalizedAt: row.finalized_at ? new Date(row.finalized_at).getTime() : null,
    };
    return acc;
  }, {});
}

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
export default function App() {
  const [view,       setView]    = useState("landing");
  const [projects,   setProjects] = useState(DEFAULT_PROJECTS);
  const [judges,     setJudges]  = useState([]);
  const [scores,     setScores]  = useState({});
  const [log,        setLog]     = useState([]);
  const [locked,     setLocked]  = useState(false);
  const [maxJudges,  setMaxJudges] = useState(15);
  const [loading,    setLoading] = useState(true);
  const [judge,      setJudge]   = useState(null);
  const [isOnline,   setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [offlineQueue, setOfflineQueue] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sf_offline_queue") || "[]"); } catch { return []; }
  });
  const [lastSyncAt, setLastSyncAt] = useState(() => {
    try {
      const raw = localStorage.getItem("sf_last_sync_at");
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  });
  const [scoringPid, setScoringPid]  = useState(null);
  const [draftSc,    setDraftSc]     = useState({});
  const [draftNotes, setDraftNotes]  = useState("");
  const [regName,    setRegName]     = useState("");
  const [regCode,    setRegCode]     = useState("");
  const [regErr,     setRegErr]      = useState("");
  const [adminPass,         setAdminPass]         = useState("");
  const [adminErr,          setAdminErr]          = useState("");
  const [adminLoginAttempts, setAdminLoginAttempts] = useState(0);
  const [adminLockoutUntil,  setAdminLockoutUntil]  = useState(null);
  const [maxJudgesErr, setMaxJudgesErr] = useState("");
  const [maxJudgesDraft, setMaxJudgesDraft] = useState("15");
  const [adminTab,   setAdminTab]    = useState("overview");

  // Share state
  const [shareToken,      setShareToken]      = useState("");
  const [shareEnabled,    setShareEnabled]    = useState(false);
  const [shareExpiry,     setShareExpiry]     = useState("never");
  const [shareCreated,    setShareCreated]    = useState(null);
  const [shareShowRubric, setShareShowRubric] = useState(true);
  const [shareTitle,      setShareTitle]      = useState("Science Fair SY 2025-2026 — Final Results");
  const [copied,          setCopied]          = useState(false);

  // IT logs state
  const [activityFilter, setActivityFilter] = useState("");
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

  // Deliberation state
  const [deliberationNotes,  setDeliberationNotes]  = useState({});
  const [finalDecisions,     setFinalDecisions]     = useState({});
  const [deliberationOpen,   setDeliberationOpen]   = useState(false);
  const [delibDraftComment,  setDelibDraftComment]  = useState("");
  const [delibDraftRec,      setDelibDraftRec]      = useState("Pending");
  const [delibDraftFlagged,  setDelibDraftFlagged]  = useState(false);
  const [delibReportCopied,  setDelibReportCopied]  = useState(false);
  const [delibDrafts,        setDelibDrafts]        = useState({}); // { [pid]: { comment, rec, flagged } }
  const [deliberationReason, setDeliberationReason] = useState(null); // "tie"|"manual"|null

  // Score backup state
  const [scoreBackups,   setScoreBackups]   = useState([]);
  const [savingBackup,   setSavingBackup]   = useState(false);
  const [backupSaved,    setBackupSaved]    = useState(false);

  // Validation & finalization state
  const [judgeValidations,   setJudgeValidations]   = useState({});
  const [adminValidation,    setAdminValidation]     = useState(null);
  const [resultsFinalized,   setResultsFinalized]    = useState(false);
  const [valComment,         setValComment]          = useState("");
  const [showValForm,        setShowValForm]         = useState(false);
  const [transferAllowances, setTransferAllowances]  = useState({}); // { [alias]: expiryTs }

  // Transfer PIN modal state
  const [showTransferPinModal,  setShowTransferPinModal]  = useState(false);
  const [transferPinAlias,      setTransferPinAlias]      = useState("");
  const [transferPin,           setTransferPin]           = useState("");
  const [transferPinErr,        setTransferPinErr]        = useState("");

  // Project management state
  const [showAddProject,     setShowAddProject]      = useState(false);
  const [editingProject,     setEditingProject]      = useState(null); // project id being edited
  const [projForm,           setProjForm]            = useState({ title:"", cat:"Biology", grade:"", num:"" });
  const [showDeleteConfirm,  setShowDeleteConfirm]   = useState(false);
  const [deleteProjectId,    setDeleteProjectId]     = useState(null);

  const EXPIRY_MS = { "1h":3600000, "24h":86400000, "7d":604800000, "never":Infinity };
  const EXPIRY_OPTS = [{ val:"1h",label:"1 Hour" },{ val:"24h",label:"24 Hours" },{ val:"7d",label:"7 Days" },{ val:"never",label:"Never" }];
  const backdrop = null;

  // ── SUPABASE LOADERS ──────────────────────────────────────
  async function loadProjects() {
    const { data } = await supabase.from("projects").select("*").order("created_at");
    if (data && data.length > 0) {
      setProjects(data.map(r => ({ id: r.id, num: r.num, title: r.title, cat: r.cat, grade: r.grade, locked: r.locked || false })));
    }
  }
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
    const { data } = await supabase.from("app_settings").select("*");
    if (data) {
      const map = Object.fromEntries(data.map(r => [r.key, r.value]));
      setLocked(map.locked === "true");
      setDeliberationOpen(map.deliberation_open === "true");
      setResultsFinalized(map.results_finalized === "true");
      const loadedMax = map.max_judges ? parseInt(map.max_judges) : 15;
      setMaxJudges(loadedMax);
      setMaxJudgesDraft(String(loadedMax));
      try {
        const raw = map.judge_transfer_allowances || "{}";
        const parsed = JSON.parse(raw);
        setTransferAllowances(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        setTransferAllowances({});
      }
    }
  }

  async function saveTransferAllowances(next) {
    setTransferAllowances(next);
    await supabase.from("app_settings").upsert({ key: "judge_transfer_allowances", value: JSON.stringify(next) });
  }

  function allowJudgeTransfer(alias) {
    setTransferPinAlias(alias);
    setTransferPin("");
    setTransferPinErr("");
    setShowTransferPinModal(true);
  }

  async function confirmTransfer() {
    if (transferPin !== IT_PIN) {
      setTransferPinErr("Incorrect PIN. Transfer approval denied.");
      addItLog("WARN","AUTH","JUDGE_TRANSFER_PIN_FAILED","Transfer approval denied due to incorrect PIN",{ alias: transferPinAlias, timestamp: fmtISO(Date.now()) });
      setTimeout(() => setTransferPin(""), 600);
      return;
    }
    const expiry = Date.now() + 10 * 60 * 1000;
    const next = { ...transferAllowances, [transferPinAlias]: expiry };
    await saveTransferAllowances(next);
    addLog(`Admin approved device transfer for ${transferPinAlias} (expires in 10 minutes)`);
    addItLog("WARN","ADMIN","JUDGE_TRANSFER_APPROVED","Admin approved judge device transfer",{ alias: transferPinAlias, expiresAt: fmtISO(expiry) });
    setShowTransferPinModal(false);
    setTransferPin("");
    setTransferPinErr("");
  }
  async function loadValidations() {
    const { data } = await supabase.from("validations").select("*");
    if (data) {
      const jv = {};
      let av = null;
      data.forEach(row => {
        const entry = { approved: row.approved, comment: row.comment, validatedAt: new Date(row.validated_at).getTime() };
        if (row.judge_id === "admin") av = entry;
        else jv[row.judge_id] = entry;
      });
      setJudgeValidations(jv);
      if (av) setAdminValidation(av);
    }
  }
  async function loadDelibNotes() {
    const { data } = await supabase.from("deliberation_notes").select("*");
    if (data) setDeliberationNotes(delibNotesToMap(data));
  }
  async function loadFinalDecisions() {
    const { data } = await supabase.from("final_decisions").select("*");
    if (data) setFinalDecisions(finalDecisionsToMap(data));
  }

  // ── INITIAL LOAD + REALTIME SUBSCRIPTIONS ─────────────────
  useEffect(() => {
    async function init() {
      const timeout = setTimeout(() => setLoading(false), 8000);
      await Promise.all([loadProjects(), loadJudges(), loadScores(), loadLog(), loadItLogs(), loadShare(), loadSettings(), loadDelibNotes(), loadFinalDecisions(), loadValidations(), loadScoreBackups()]);
      clearTimeout(timeout);
      setLoading(false);
    }
    init();

    const channel = supabase.channel("app-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, loadProjects)
      .on("postgres_changes", { event: "*", schema: "public", table: "judges" }, ({ eventType, new: row }) => {
        if (eventType === "INSERT") setJudges(prev => [...prev, dbToJudge(row)].sort((a,b) => a.joinedAt - b.joinedAt));
        else if (eventType === "UPDATE") setJudges(prev => prev.map(j => j.id === row.id ? dbToJudge(row) : j));
        else loadJudges(); // DELETE (reset)
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, ({ eventType, new: row }) => {
        if (eventType === "INSERT" || eventType === "UPDATE") {
          const key = `${row.judge_id}_${row.project_id}`;
          setScores(prev => ({ ...prev, [key]: { presentation:row.presentation, testable_q:row.testable_q, background:row.background, hypothesis:row.hypothesis, variables:row.variables, materials:row.materials, data:row.data, analysis:row.analysis, conclusion:row.conclusion, abstract:row.abstract, notes:row.notes||"", time:new Date(row.submitted_at).getTime() } }));
        } else {
          loadScores(); // DELETE (reset or project removal)
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, ({ new: row }) => {
        setLog(prev => [dbToLog(row), ...prev]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "it_logs" }, ({ new: row }) => {
        setItLogs(prev => [dbToItLog(row), ...prev]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "share_links" },  loadShare)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, loadSettings)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliberation_notes" }, ({ eventType, new: row }) => {
        if (eventType === "INSERT" || eventType === "UPDATE") {
          const key = `${row.judge_id}_${row.project_id}`;
          setDeliberationNotes(prev => ({ ...prev, [key]: { comment:row.comment, recommendation:row.recommendation, flagged:row.flagged, submittedAt:new Date(row.submitted_at).getTime() } }));
        } else {
          loadDelibNotes(); // DELETE
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "final_decisions" }, ({ eventType, new: row }) => {
        if (eventType === "INSERT" || eventType === "UPDATE") {
          setFinalDecisions(prev => ({ ...prev, [row.project_id]: { award:row.award, adminNotes:row.admin_notes||"", finalized:row.finalized, finalizedAt:row.finalized_at ? new Date(row.finalized_at).getTime() : null } }));
        } else {
          loadFinalDecisions(); // DELETE
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "validations" }, ({ eventType, new: row }) => {
        if (eventType === "INSERT" || eventType === "UPDATE") {
          const entry = { approved:row.approved, comment:row.comment, validatedAt:new Date(row.validated_at).getTime() };
          if (row.judge_id === "admin") setAdminValidation(entry);
          else setJudgeValidations(prev => ({ ...prev, [row.judge_id]: entry }));
        } else {
          loadValidations(); // DELETE (reset)
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── INSTANT CACHE RESTORE (runs before Supabase loads) ────
  useEffect(() => {
    const savedId   = localStorage.getItem("sf_judge_id");
    const savedData = localStorage.getItem("sf_judge_data");
    if (savedId && savedData) {
      try {
        const cachedJudge  = JSON.parse(savedData);
        const cachedScores = localStorage.getItem("sf_scores_cache");
        setJudge(cachedJudge);
        if (cachedScores) setScores(JSON.parse(cachedScores));
        setView("judge-home");
      } catch {
        localStorage.removeItem("sf_judge_id");
        localStorage.removeItem("sf_judge_data");
        localStorage.removeItem("sf_scores_cache");
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SESSION SYNC (after Supabase loads) ───────────────────
  // Refresh judge from DB, or clear if admin has reset all data.
  useEffect(() => {
    if (loading) return;
    const savedId = localStorage.getItem("sf_judge_id");
    if (!savedId) return;
    if (judges.length > 0) {
      const found = judges.find(j => j.id === savedId);
      if (found) {
        setJudge(found);
        localStorage.setItem("sf_judge_data", JSON.stringify(found));
        setView("judge-home");
      } else {
        // Judge was reset by admin — wipe local cache
        localStorage.removeItem("sf_judge_id");
        localStorage.removeItem("sf_judge_data");
        localStorage.removeItem("sf_scores_cache");
        localStorage.removeItem("sf_offline_queue");
        setJudge(null); setView("landing");
      }
    }
    // judges.length === 0 means Supabase was unreachable — keep the cached session
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SCORE CACHE ───────────────────────────────────────────
  // Persist this judge's own scores to localStorage after every change.
  useEffect(() => {
    if (loading || !judge) return;
    const myScores = {};
    judge.projects.forEach(pid => {
      const key = `${judge.id}_${pid}`;
      if (scores[key]) myScores[key] = scores[key];
    });
    localStorage.setItem("sf_scores_cache", JSON.stringify(myScores));
  }, [scores, judge, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ONLINE / OFFLINE EVENTS ───────────────────────────────
  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOnline) flushOfflineQueue();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  async function flushOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem("sf_offline_queue") || "[]");
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      const { error } = await supabase.from("scores").upsert(item.data, { onConflict: "judge_id,project_id" });
      if (error) remaining.push(item);
    }
    localStorage.setItem("sf_offline_queue", JSON.stringify(remaining));
    setOfflineQueue(remaining);
    if (remaining.length < queue.length) {
      const syncedAt = Date.now();
      setLastSyncAt(syncedAt);
      localStorage.setItem("sf_last_sync_at", String(syncedAt));
      addItLog("INFO","DB","OFFLINE_QUEUE_FLUSHED",`Synced ${queue.length - remaining.length} queued score(s) to server`,{ synced: queue.length - remaining.length });
    }
  }

  function assignProjects(idx) {
    // Every judge scores every project (flexible for any number of projects/judges)
    return projects.map(p => p.id);
  }

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

  async function updateMaxJudges(newMax) {
    const numMax = parseInt(newMax) || 15;
    if (isNaN(numMax) || numMax < 1) {
      setMaxJudgesErr("Max judges must be at least 1.");
      return;
    }
    if (numMax < judges.length) {
      setMaxJudgesErr(`Cannot lower limit below current judges (${judges.length}). Remove judges first.`);
      return;
    }
    try {
      await supabase.from("app_settings").update({ value: String(numMax) }).eq("key", "max_judges");
      setMaxJudges(numMax);
      setMaxJudgesDraft(String(numMax));
      setMaxJudgesErr("");
      addLog(`Admin set max judges to ${numMax}`);
      addItLog("INFO","ADMIN","MAX_JUDGES_UPDATED","Admin updated max judges setting",{ newMax: numMax, currentCount: judges.length });
    } catch (err) {
      setMaxJudgesErr("Failed to update setting. Try again.");
      addItLog("ERROR","ADMIN","MAX_JUDGES_UPDATE_FAILED","Failed to update max judges setting",{ error: err?.message, attempted: numMax });
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl()).catch(()=>{});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function loadScoreBackups() {
    const { data } = await supabase.from("score_backups").select("id, label, created_at").order("created_at", { ascending: false });
    if (data) setScoreBackups(data);
  }

  async function saveScoreBackup() {
    setSavingBackup(true);
    setBackupSaved(false);
    const entries = [];
    for (const judge of judges) {
      for (const pid of judge.projects) {
        const sc = scores[`${judge.id}_${pid}`];
        if (!sc) continue;
        const proj = projects.find(p => p.id === pid);
        entries.push({
          judgeId:   judge.id,
          judgeAlias: judge.alias,
          projectId:  pid,
          projectNum: proj?.num ?? "",
          projectTitle: proj?.title ?? "",
          category:   proj?.cat ?? "",
          grade:      proj?.grade ?? "",
          presentation: sc.presentation,
          testable_q:   sc.testable_q,
          background:   sc.background,
          hypothesis:   sc.hypothesis,
          variables:    sc.variables,
          materials:    sc.materials,
          data:         sc.data,
          analysis:     sc.analysis,
          conclusion:   sc.conclusion,
          abstract:     sc.abstract,
          total:        getTotal(sc),
          notes:        sc.notes || "",
          submittedAt:  sc.time ? new Date(sc.time).toISOString() : "",
        });
      }
    }
    const snapshot = {
      generatedAt:   new Date().toISOString(),
      judgeCount:    judges.length,
      projectCount:  projects.length,
      scoreCount:    entries.length,
      entries,
    };
    const label = `Backup — ${new Date().toLocaleString()}`;
    const { data, error } = await supabase.from("score_backups").insert({ label, snapshot }).select("id, label, created_at").single();
    if (!error && data) {
      setScoreBackups(prev => [data, ...prev]);
      addLog(`Admin saved score backup (${entries.length} entries)`);
      addItLog("INFO","ADMIN","SCORE_BACKUP_SAVED","Admin saved score backup to database",{ entryCount: entries.length, label });
      setBackupSaved(true);
      setTimeout(() => setBackupSaved(false), 3000);
    }
    setSavingBackup(false);
  }

  function exportJudgeScoresCSV() {
    const header = [
      "Judge","Project #","Project Title","Category","Grade",
      "Presentation (6)","Testable Q (3)","Background (3)","Hypothesis (3)",
      "Variables (3)","Materials (3)","Data (6)","Analysis (6)",
      "Conclusion (3)","Abstract (6)","Total (42)","Notes","Submitted"
    ];
    const rows = [header];
    for (const judge of [...judges].sort((a,b) => a.alias.localeCompare(b.alias))) {
      for (const proj of [...projects].sort((a,b) => (a.num||"").localeCompare(b.num||""))) {
        const sc = scores[`${judge.id}_${proj.id}`];
        if (!sc) continue;
        rows.push([
          judge.alias,
          proj.num,
          `"${(proj.title||"").replace(/"/g,'""')}"`,
          proj.cat,
          proj.grade,
          sc.presentation, sc.testable_q, sc.background, sc.hypothesis,
          sc.variables, sc.materials, sc.data, sc.analysis, sc.conclusion, sc.abstract,
          getTotal(sc),
          `"${(sc.notes||"").replace(/"/g,'""')}"`,
          sc.time ? new Date(sc.time).toISOString() : "",
        ]);
      }
    }
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `judge-scores-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBackupCSV(backup) {
    const entries = backup?.snapshot?.entries;
    if (!entries?.length) return;
    const header = [
      "Judge","Project #","Project Title","Category","Grade",
      "Presentation (6)","Testable Q (3)","Background (3)","Hypothesis (3)",
      "Variables (3)","Materials (3)","Data (6)","Analysis (6)",
      "Conclusion (3)","Abstract (6)","Total (42)","Notes","Submitted"
    ];
    const rows = [header, ...entries.map(e => [
      e.judgeAlias, e.projectNum,
      `"${(e.projectTitle||"").replace(/"/g,'""')}"`,
      e.category, e.grade,
      e.presentation, e.testable_q, e.background, e.hypothesis,
      e.variables, e.materials, e.data, e.analysis, e.conclusion, e.abstract,
      e.total,
      `"${(e.notes||"").replace(/"/g,'""')}"`,
      e.submittedAt,
    ])];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `score-backup-${backup.id?.slice(0,8)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportResultsCSV() {
    const ranked = rankedProjects();
    const rows = [
      ["Rank","Project #","Title","Category","Grade","Avg Score","Reviews","Award"],
      ...ranked.map((p, i) => {
        const decision = finalDecisions[p.id];
        return [
          i + 1, p.num,
          `"${(p.title || "").replace(/"/g, '""')}"`,
          p.cat, p.grade,
          p.avg ?? "",
          p.revs,
          decision?.finalized ? decision.award : "Pending"
        ];
      })
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "science-fair-results.csv"; a.click();
    URL.revokeObjectURL(url);
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
      `Projects          : ${projects.length}`,
      `Scores Submitted  : ${totalScored()} / ${possible()}`,
      `Completion        : ${Math.round((totalScored()/possible())*100)||0}%`,
      `Judging Locked    : ${locked}`,
      `Results Link Live : ${isLinkLive()}`,
      shareToken ? `Share Token       : ${shareToken}` : `Share Token       : (none)`,
      `Deliberation      : ${deliberationOpen ? "Open" : "Closed"}`,
      `Delib Notes       : ${Object.keys(deliberationNotes).length}`,
      `Decisions         : ${Object.values(finalDecisions).filter(d => d.finalized).length} finalized / ${projects.length} total`,
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
      `delib_open   = ${deliberationOpen}`,
      `delib_notes  = ${Object.keys(deliberationNotes).length}`,
      `decisions    = ${Object.keys(finalDecisions).length}`,
      `finalized    = ${Object.values(finalDecisions).filter(d => d.finalized).length}`,
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
    addItLog("WARN","ADMIN","FULL_RESET","Admin performed a full data reset of the application",{ judgesCleared:judges.length, scoresCleared:Object.keys(scores).length, delibNotesCleared:Object.keys(deliberationNotes).length, decisionsCleared:Object.keys(finalDecisions).length, maxJudgesResetTo:15, timestamp:fmtISO(Date.now()) });
    // Delete all transient data. activity_log is intentionally excluded (security audit trail).
    await Promise.all([
      supabase.from("scores").delete().not("id", "is", null),
      supabase.from("judges").delete().neq("id", ""),
      supabase.from("share_links").delete().not("id", "is", null),
      supabase.from("app_settings").update({ value: "false" }).eq("key", "locked"),
      supabase.from("deliberation_notes").delete().not("id", "is", null),
      supabase.from("final_decisions").delete().not("id", "is", null),
      supabase.from("app_settings").update({ value: "false" }).eq("key", "deliberation_open"),
      supabase.from("app_settings").update({ value: "15" }).eq("key", "max_judges"),
      supabase.from("app_settings").upsert({ key: "judge_transfer_allowances", value: "{}" }),
      supabase.from("app_settings").upsert({ key: "results_finalized", value: "false" }),
      supabase.from("validations").delete().not("judge_id", "is", null),
    ]);
    setJudges([]);
    setScores({});
    addLog("Admin performed a full data reset — activity log preserved for security review");
    setLocked(false);
    setMaxJudges(15);
    setShareEnabled(false);
    setShareToken("");
    setShareCreated(null);
    setShareExpiry("never");
    setShareTitle("Science Fair SY 2025-2026 — Final Results");
    setDeliberationNotes({});
    setFinalDecisions({});
    setDeliberationOpen(false);
    setDeliberationReason(null);
    setJudgeValidations({});
    setAdminValidation(null);
    setResultsFinalized(false);
    setTransferAllowances({});
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
    return projects
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
  function draftTotal() {
    const proj = projects.find(p => p.id === scoringPid);
    return RUBRIC.reduce((s,r) => {
      if (r.id === "abstract" && proj && !requiresAbstract(proj)) return s;
      return s + (Number(draftSc[r.id])||0);
    }, 0);
  }
  function maxDraftScore() {
    const proj = projects.find(p => p.id === scoringPid);
    return requiresAbstract(proj) ? 42 : 36;
  }
  function allMoved() {
    const proj = projects.find(p => p.id === scoringPid);
    return RUBRIC.every(r => {
      if (r.id === "abstract" && proj && !requiresAbstract(proj)) return true;
      return draftSc[r.id] !== undefined;
    });
  }
  function hasZeroScore() {
    const proj = projects.find(p => p.id === scoringPid);
    if (!proj || !requiresAbstract(proj)) return false;
    return RUBRIC.some(r => draftSc[r.id] === 0);
  }

  function getAnomalies() {
    const out = [];
    projects.forEach(p => {
      const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${p.id}`));
      if (hits.length < 2) return;
      const tots = hits.map(([,s]) => getTotal(s));
      const avg  = tots.reduce((a,b) => a+b, 0) / tots.length;
      hits.forEach(([key,s]) => {
        const t = getTotal(s);
        if (Math.abs(t - avg) > 8) {
          const jj = judges.find(j => key.startsWith(j.id));
          out.push({ project: p.title, judge: jj?.alias || "Unknown", score: t, avg: avg.toFixed(1) });
        }
      });
    });
    return out;
  }

  // Deliberation helpers
  function getDelibNotesForProject(pid) {
    return Object.entries(deliberationNotes)
      .filter(([k]) => k.endsWith(`_${pid}`))
      .map(([k, v]) => {
        const judgeId = k.slice(0, k.lastIndexOf(`_${pid}`));
        const j = judges.find(jj => jj.id === judgeId);
        return { ...v, judgeAlias: j?.alias || "Unknown" };
      });
  }
  function getRecBreakdown(pid) {
    const notes = getDelibNotesForProject(pid);
    const counts = {};
    RECOMMENDATIONS.forEach(r => counts[r] = 0);
    notes.forEach(n => { if (counts[n.recommendation] !== undefined) counts[n.recommendation]++; });
    return counts;
  }
  function getFlagCount(pid) {
    return getDelibNotesForProject(pid).filter(n => n.flagged).length;
  }

  // Validation helpers
  function completedJudges() {
    return judges.filter(j => judgeComp(j).pct === 100);
  }
  function hasTie() {
    const scored = rankedProjects().filter(p => p.avg);
    for (let i = 0; i < scored.length - 1; i++) {
      if (scored[i].avg === scored[i + 1].avg) return true;
    }
    return false;
  }
  function consensusReached() {
    const done = completedJudges();
    if (!done.length || !adminValidation?.approved) return false;
    return done.every(j => judgeValidations[j.id]?.approved === true);
  }
  function valProgress() {
    const done = completedJudges();
    const approved = done.filter(j => judgeValidations[j.id]?.approved === true).length;
    const flagged  = done.filter(j => judgeValidations[j.id]?.approved === false).length;
    return { total: done.length, approved, flagged, pending: done.length - approved - flagged };
  }

  function recPillClass(rec) {
    return rec === "Recommend for Award" ? "award" : rec === "Strong Contender" ? "strong" : rec === "Good Work" ? "good" : "needs";
  }
  function awardBadgeClass(award) {
    return award === "1st Place" ? "gold" : award === "2nd Place" ? "silver" : award === "3rd Place" ? "bronze"
      : award === "Honorable Mention" ? "hm" : award === "Best in Category" ? "best" : "none";
  }
  function awardEmoji(award) {
    return award === "1st Place" ? "🥇" : award === "2nd Place" ? "🥈" : award === "3rd Place" ? "🥉"
      : award === "Honorable Mention" ? "🏅" : award === "Best in Category" ? "⭐" : "";
  }
  function buildDelibReport() {
    const now = new Date().toISOString();
    const ranked = rankedProjects();
    const lines = [
      "╔══════════════════════════════════════════════════════════════╗",
      "║     SCIENCE FAIR APP — DELIBERATION SUMMARY REPORT          ║",
      "╚══════════════════════════════════════════════════════════════╝",
      `Generated: ${now}`,
      "",
      "── PROJECTS (RANKED BY SCORE) ─────────────────────────────────",
      "",
    ];
    ranked.forEach((p, i) => {
      const decision = finalDecisions[p.id];
      const notes = getDelibNotesForProject(p.id);
      const breakdown = getRecBreakdown(p.id);
      const flags = getFlagCount(p.id);
      lines.push(`#${i+1} — ${p.title} (${p.cat}, Grade ${p.grade})`);
      lines.push(`  Avg Score: ${p.avg ?? "N/A"} / 42  |  Reviews: ${p.revs}`);
      lines.push(`  Award Decision: ${decision?.award || "Pending"}${decision?.finalized ? " [FINALIZED]" : ""}`);
      if (decision?.adminNotes) lines.push(`  Admin Notes: ${decision.adminNotes}`);
      lines.push(`  Recommendations: ${RECOMMENDATIONS.map(r => `${r}: ${breakdown[r]}`).join(", ")}`);
      lines.push(`  Flags for Discussion: ${flags}`);
      if (notes.length > 0) {
        lines.push("  Judge Comments:");
        notes.forEach(n => {
          lines.push(`    [${n.judgeAlias}] Rec: ${n.recommendation}${n.flagged ? " [FLAGGED]" : ""}`);
          if (n.comment) lines.push(`      "${n.comment}"`);
        });
      }
      lines.push("");
    });
    lines.push("── END OF REPORT ─────────────────────────────────────────────");
    return lines.join("\n");
  }

  // Actions
  async function handleRegister() {
    const name = regName.trim();
    if (!JUDGE_NAMES.includes(name)) {
      setRegErr(`Invalid judge name. Use Judge1 – Judge${maxJudges}.`);
      addItLog("WARN","AUTH","INVALID_JUDGE_NAME","Failed registration attempt with invalid judge name",{ attemptedName: name, maxJudges, timestamp: fmtISO(Date.now()) });
      return;
    }
    if (regCode.trim().toUpperCase() !== INVITE_CODE) {
      setRegErr("Invalid invite code.");
      addItLog("WARN","AUTH","INVALID_INVITE_CODE","Failed registration attempt with wrong invite code",{ attemptedCode: regCode.trim(), name, timestamp: fmtISO(Date.now()) });
      return;
    }

    const existingJudge = judges.find(j => j.alias === name);
    if (existingJudge) {
      const allowedUntil = transferAllowances[name] || 0;
      if (!allowedUntil || Date.now() > allowedUntil) {
        setRegErr(`${name} is already signed in. Ask admin to approve device transfer.`);
        addItLog("WARN","AUTH","JUDGE_TRANSFER_DENIED","Judge transfer blocked — no admin approval",{ alias:name, timestamp:fmtISO(Date.now()) });
        return;
      }

      setJudge(existingJudge);
      localStorage.setItem("sf_judge_id", existingJudge.id);
      localStorage.setItem("sf_judge_data", JSON.stringify(existingJudge));
      const nextAllow = { ...transferAllowances };
      delete nextAllow[name]; // one-time use transfer approval
      await saveTransferAllowances(nextAllow);
      addLog(`${existingJudge.alias} session transferred to a new device`);
      addItLog("WARN","AUTH","JUDGE_SESSION_TRANSFERRED","Existing judge session transferred to another device (admin-approved)",{
        judgeId: existingJudge.id,
        alias: existingJudge.alias,
        timestamp: fmtISO(Date.now()),
      });
      setRegName(""); setRegCode(""); setRegErr(""); setView("judge-home");
      return;
    }

    if (judges.length >= maxJudges) {
      setRegErr(`Max judges (${maxJudges}) reached. Contact admin to increase the limit.`);
      addItLog("WARN","AUTH","MAX_JUDGES_REACHED","Judge registration blocked — max limit reached",{ attempted: name, currentCount: judges.length, maxJudges: maxJudges, timestamp: fmtISO(Date.now()) });
      return;
    }
    const seed = parseInt(name.replace(/\D/g, "")) - 1;
    const j = { id:"j_"+uid(), alias:name, projects:assignProjects(seed), joinedAt:Date.now() };
    const { error } = await supabase.from("judges").insert({ id: j.id, alias: j.alias, projects: j.projects });
    if (error) { setRegErr("Registration failed. Please try again."); return; }
    setJudges(p => [...p, j]); setJudge(j);
    localStorage.setItem("sf_judge_id",   j.id);
    localStorage.setItem("sf_judge_data", JSON.stringify(j));
    addLog(`${j.alias} joined as a judge`);
    addItLog("INFO","AUTH","JUDGE_REGISTERED","Judge registered with valid credentials",{ judgeId:j.id, alias:j.alias, assignedProjects:j.projects });
    setRegName(""); setRegCode(""); setRegErr(""); setView("judge-home");
  }

  function handleAdminLogin() {
    if (adminLockoutUntil && Date.now() < adminLockoutUntil) {
      const secs = Math.ceil((adminLockoutUntil - Date.now()) / 1000);
      setAdminErr(`Too many failed attempts. Try again in ${secs}s.`);
      return;
    }
    if (adminPass === ADMIN_PASS) {
      setAdminLoginAttempts(0);
      setAdminLockoutUntil(null);
      addItLog("INFO","AUTH","ADMIN_LOGIN_SUCCESS","Admin authenticated successfully",{ sessionToken:"adm_***masked***" });
      setView("admin-home"); setAdminPass(""); setAdminErr("");
    } else {
      const next = adminLoginAttempts + 1;
      setAdminLoginAttempts(next);
      addItLog("WARN","AUTH","ADMIN_LOGIN_FAILED","Admin login attempted with incorrect password",{ attempt: next });
      if (next >= 5) {
        const until = Date.now() + 30000;
        setAdminLockoutUntil(until);
        setAdminLoginAttempts(0);
        setAdminErr("Too many failed attempts. Locked for 30 seconds.");
      } else {
        setAdminErr(`Incorrect password. ${5 - next} attempt${5 - next !== 1 ? "s" : ""} remaining.`);
      }
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
    const payload = {
      judge_id: judge.id, project_id: scoringPid,
      presentation: draftSc.presentation||0, testable_q: draftSc.testable_q||0,
      background: draftSc.background||0, hypothesis: draftSc.hypothesis||0,
      variables: draftSc.variables||0, materials: draftSc.materials||0,
      data: draftSc.data||0, analysis: draftSc.analysis||0,
      conclusion: draftSc.conclusion||0, abstract: draftSc.abstract||0,
      notes: draftNotes,
    };
    const { error } = await supabase.from("scores").upsert(payload, { onConflict: "judge_id,project_id" });
    if (error || !navigator.onLine) {
      const q = JSON.parse(localStorage.getItem("sf_offline_queue") || "[]");
      const filtered = q.filter(x => !(x.data.judge_id === judge.id && x.data.project_id === scoringPid));
      filtered.push({ data: payload, ts: Date.now() });
      localStorage.setItem("sf_offline_queue", JSON.stringify(filtered));
      setOfflineQueue(filtered);
      addItLog("WARN","DB","SCORE_QUEUED","Score saved locally — will sync when online",{ judgeId:judge.id, projectId:scoringPid });
    } else {
      const syncedAt = Date.now();
      setLastSyncAt(syncedAt);
      localStorage.setItem("sf_last_sync_at", String(syncedAt));
    }
    const proj = projects.find(p=>p.id===scoringPid);
    addLog(`${judge.alias} submitted score for Project #${proj.num}`);
    addItLog("INFO","SCORE","SCORE_SUBMITTED","Judge submitted score for assigned project",{ judgeId:judge.id, alias:judge.alias, projectId:scoringPid, projectNum:proj.num, total, rubric:draftSc });
    setView("judge-home");
  }

  async function submitDelibNote(pid) {
    if (!deliberationOpen) return;
    const key = `${judge.id}_${pid}`;
    const entry = { comment: delibDraftComment, recommendation: delibDraftRec, flagged: delibDraftFlagged, submittedAt: Date.now() };
    setDeliberationNotes(p => ({ ...p, [key]: entry }));
    await supabase.from("deliberation_notes").upsert({
      judge_id: judge.id, project_id: pid,
      comment: delibDraftComment, recommendation: delibDraftRec, flagged: delibDraftFlagged,
    }, { onConflict: "judge_id,project_id" });
    const proj = projects.find(p => p.id === pid);
    addLog(`${judge.alias} submitted deliberation note for Project #${proj.num}`);
    addItLog("INFO","JUDGE","DELIB_NOTE_SUBMITTED","Judge submitted deliberation note",
      { judgeId:judge.id, alias:judge.alias, projectId:pid, projectNum:proj.num, recommendation:delibDraftRec, flagged:delibDraftFlagged });
    setDelibDraftComment(""); setDelibDraftRec("Pending"); setDelibDraftFlagged(false);
  }

  async function openDeliberation(reason) {
    setDeliberationOpen(true);
    setDeliberationReason(reason);
    await supabase.from("app_settings").upsert({ key: "deliberation_open", value: "true" });
    const msg = reason === "tie" ? "Deliberation triggered due to tied scores" : "Admin manually opened deliberation";
    addLog(msg);
    addItLog("INFO","ADMIN","DELIBERATION_OPENED", msg, { reason, timestamp:fmtISO(Date.now()) });
  }
  async function closeDeliberation() {
    setDeliberationOpen(false);
    setDeliberationReason(null);
    await supabase.from("app_settings").upsert({ key: "deliberation_open", value: "false" });
    addLog("Admin closed deliberation phase");
    addItLog("INFO","ADMIN","DELIBERATION_CLOSED","Admin closed deliberation phase",{ timestamp:fmtISO(Date.now()) });
  }
  async function submitJudgeValidation(approved) {
    const entry = { approved, comment: valComment, validatedAt: Date.now() };
    setJudgeValidations(p => ({ ...p, [judge.id]: entry }));
    await supabase.from("validations").upsert({ judge_id: judge.id, approved, comment: valComment }, { onConflict: "judge_id" });
    addLog(`${judge.alias} ${approved ? "validated" : "raised a concern about"} the computed results`);
    addItLog(approved?"INFO":"WARN","JUDGE", approved?"RESULTS_VALIDATED":"RESULTS_CONCERN",
      approved ? "Judge validated computed results" : "Judge raised concern about results",
      { judgeId:judge.id, alias:judge.alias, comment:valComment, timestamp:fmtISO(Date.now()) });
    setValComment(""); setShowValForm(false);
  }
  async function submitAdminValidation(approved) {
    const entry = { approved, comment: valComment, validatedAt: Date.now() };
    setAdminValidation(entry);
    await supabase.from("validations").upsert({ judge_id: "admin", approved, comment: valComment }, { onConflict: "judge_id" });
    addLog(`Admin ${approved ? "validated" : "flagged concerns with"} the computed results`);
    addItLog(approved?"INFO":"WARN","ADMIN", approved?"ADMIN_RESULTS_VALIDATED":"ADMIN_RESULTS_CONCERN",
      approved ? "Admin validated computed results" : "Admin flagged concerns with results",
      { approved, comment:valComment, timestamp:fmtISO(Date.now()) });
    setValComment(""); setShowValForm(false);
  }
  async function finalizeResults() {
    setResultsFinalized(true);
    if (deliberationOpen) { setDeliberationOpen(false); setDeliberationReason(null); }
    await supabase.from("app_settings").upsert({ key: "results_finalized", value: "true" });
    addLog("Admin finalized results — public sharing now available");
    addItLog("INFO","ADMIN","RESULTS_FINALIZED","Admin finalized results for public sharing",{ timestamp:fmtISO(Date.now()) });
  }

  async function saveFinalDecision(pid, award, adminNotes) {
    const isFinalize = award !== "Pending";
    const entry = { award, adminNotes, finalized: isFinalize, finalizedAt: isFinalize ? Date.now() : null };
    setFinalDecisions(p => ({ ...p, [pid]: entry }));
    await supabase.from("final_decisions").upsert({
      project_id: pid, award, admin_notes: adminNotes,
      finalized: isFinalize, finalized_at: isFinalize ? new Date().toISOString() : null,
    }, { onConflict: "project_id" });
    const proj = projects.find(p => p.id === pid);
    addLog(`Admin ${isFinalize ? "finalized" : "updated"} decision for Project #${proj.num}: ${award}`);
    addItLog("INFO","ADMIN", isFinalize?"DECISION_FINALIZED":"DECISION_UPDATED",
      `Admin ${isFinalize?"finalized":"updated"} award decision for project`,
      { projectId:pid, projectNum:proj.num, award, timestamp:fmtISO(Date.now()) });
  }

  async function reviseDecision(pid) {
    setFinalDecisions(p => ({ ...p, [pid]: { ...p[pid], finalized: false, finalizedAt: null } }));
    await supabase.from("final_decisions").update({ finalized: false, finalized_at: null }).eq("project_id", pid);
    const proj = projects.find(p => p.id === pid);
    addLog(`Admin reopened decision for Project #${proj.num} for revision`);
    addItLog("INFO","ADMIN","DECISION_REVISED","Admin reopened award decision for revision",
      { projectId:pid, projectNum:proj.num, timestamp:fmtISO(Date.now()) });
  }

  // ── PROJECT MANAGEMENT ──────────────────────────────────────
  function nextProjectNum() {
    const nums = projects.map(p => parseInt(p.num) || 0);
    return String(Math.max(0, ...nums) + 1).padStart(3, "0");
  }

  async function addProject() {
    const { title, cat, grade, num } = projForm;
    if (!title.trim()) return;
    const id = "p_" + uid();
    const finalNum = num.trim() || nextProjectNum();
    const proj = { id, num: finalNum, title: title.trim(), cat, grade, locked: false };
    setProjects(p => [...p, proj]);
    await supabase.from("projects").insert(proj);
    addLog(`Admin added project: ${proj.title} (#${finalNum})`);
    addItLog("INFO","ADMIN","PROJECT_ADDED","Admin added a new project",
      { projectId:id, num:finalNum, title:proj.title, cat, grade, timestamp:fmtISO(Date.now()) });
    setProjForm({ title:"", cat:"Biology", grade:"", num:"" });
    setShowAddProject(false);
  }

  async function updateProject(pid) {
    const existing = projects.find(p => p.id === pid);
    if (!existing || existing.locked) return;
    const { title, cat, grade, num } = projForm;
    if (!title.trim()) return;
    const updated = { ...existing, title: title.trim(), cat, grade, num: num.trim() || existing.num };
    setProjects(p => p.map(pp => pp.id === pid ? updated : pp));
    await supabase.from("projects").update({ title: updated.title, cat: updated.cat, grade: updated.grade, num: updated.num }).eq("id", pid);
    addLog(`Admin updated project #${updated.num}: ${updated.title}`);
    addItLog("INFO","ADMIN","PROJECT_UPDATED","Admin updated project details",
      { projectId:pid, title:updated.title, num:updated.num, timestamp:fmtISO(Date.now()) });
    setEditingProject(null);
    setProjForm({ title:"", cat:"Biology", grade:"", num:"" });
  }

  async function removeProject(pid) {
    const proj = projects.find(p => p.id === pid);
    if (!proj || proj.locked) return;
    // Clean up all related data
    const relatedScoreKeys = Object.keys(scores).filter(k => k.endsWith(`_${pid}`));
    const relatedDelibKeys = Object.keys(deliberationNotes).filter(k => k.endsWith(`_${pid}`));
    // Remove from local state
    setProjects(p => p.filter(pp => pp.id !== pid));
    if (relatedScoreKeys.length) setScores(p => { const n = {...p}; relatedScoreKeys.forEach(k => delete n[k]); return n; });
    if (relatedDelibKeys.length) setDeliberationNotes(p => { const n = {...p}; relatedDelibKeys.forEach(k => delete n[k]); return n; });
    setFinalDecisions(p => { const n = {...p}; delete n[pid]; return n; });
    // Remove from Supabase
    await Promise.all([
      supabase.from("scores").delete().eq("project_id", pid),
      supabase.from("deliberation_notes").delete().eq("project_id", pid),
      supabase.from("final_decisions").delete().eq("project_id", pid),
      supabase.from("projects").delete().eq("id", pid),
    ]);
    // Remove from judge assignments (clean orphaned refs)
    for (const j of judges) {
      if (j.projects.includes(pid)) {
        const newProjs = j.projects.filter(id => id !== pid);
        await supabase.from("judges").update({ projects: newProjs }).eq("id", j.id);
      }
    }
    addLog(`Admin removed project #${proj.num}: ${proj.title}`);
    addItLog("WARN","ADMIN","PROJECT_REMOVED","Admin removed a project and all related data",
      { projectId:pid, num:proj.num, title:proj.title, scoresCleared:relatedScoreKeys.length, delibCleared:relatedDelibKeys.length, timestamp:fmtISO(Date.now()) });
  }

  async function toggleProjectLock(pid) {
    const proj = projects.find(p => p.id === pid);
    if (!proj) return;
    const next = !proj.locked;
    setProjects(p => p.map(pp => pp.id === pid ? { ...pp, locked: next } : pp));
    await supabase.from("projects").update({ locked: next }).eq("id", pid);
    addLog(`Admin ${next ? "locked" : "unlocked"} project #${proj.num}`);
    addItLog("INFO","ADMIN", next ? "PROJECT_LOCKED" : "PROJECT_UNLOCKED",
      `Admin ${next ? "locked" : "unlocked"} project`,
      { projectId:pid, num:proj.num, title:proj.title, timestamp:fmtISO(Date.now()) });
  }

  // ─── VIEWS ───

  /* LOADING */
  if (loading && !judge) return (
    <div className="app"><style>{CSS}</style>{backdrop}
      <div className="center">
        <div style={{ textAlign:"center", color:"var(--dim)" }}>
          <div style={{ fontSize:"2.5rem", marginBottom:"1rem" }}>⏳</div>
          <div style={{ fontFamily:"var(--ff-m)", fontSize:".9rem", letterSpacing:".1em" }}>Connecting…</div>
        </div>
      </div>
    </div>
  );

  /* LANDING */
  if (view === "landing") return (
    <div className="app"><style>{CSS}</style>{backdrop}
      <div className="glow" />
      <div className="center" style={{ position:"relative" }}>
        <div className="school-banner">
          <img src="/logo.png" alt="Dishchiibikoh Community School" />
          <div className="school-name">Dishchiibikoh <span>Community School</span></div>
          <div className="school-div" />
        </div>
        <div className="land-badge">🔬 Science Fair SY 2025-2026 · Digital Judging</div>
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
      </div>
    </div>
  );

  /* JUDGE REGISTER */
  if (view === "judge-register") return (
    <div className="app"><style>{CSS}</style>{backdrop}
      <div className="center"><div className="inner">
        <button className="back" onClick={() => { setView("landing"); setRegErr(""); setRegCode(""); setRegName(""); }}>← Back</button>
        <div className="card">
          <div style={{ textAlign:"center", marginBottom:"1.5rem" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:".5rem" }}>🔐</div>
            <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.5rem", marginBottom:".4rem", color:"var(--navy)" }}>Judge Sign In</h2>
            <p style={{ color:"var(--dim)", fontSize:".95rem" }}>Enter your assigned judge name and the event invite code.</p>
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Judge Name</div>
            <input type="text" placeholder="e.g. Judge1" value={regName}
              onChange={e => { setRegName(e.target.value.trim()); setRegErr(""); }}
              onKeyDown={e => e.key==="Enter" && handleRegister()}
              style={{ textAlign:"center", fontFamily:"var(--ff-m)", fontSize:"1.1rem" }} />
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Invite Code</div>
            <input type="text" placeholder="Event invite code" value={regCode}
              onChange={e => { setRegCode(e.target.value.toUpperCase()); setRegErr(""); }}
              onKeyDown={e => e.key==="Enter" && handleRegister()}
              style={{ textAlign:"center", letterSpacing:".18em", fontFamily:"var(--ff-m)", fontSize:"1.1rem" }} />
            {regErr && <div className="err">⚠ {regErr}</div>}
          </div>
          <button className="btn" onClick={handleRegister}>Enter as Judge →</button>
          <p style={{ textAlign:"center", fontSize:".72rem", color:"var(--dim)", marginTop:".9rem" }}>
            🔒 Judge names are Judge1 – Judge{maxJudges}. Get your invite code from the administrator.
          </p>
        </div>
      </div></div>
    </div>
  );

  /* JUDGE HOME */
  if (view === "judge-home" && judge) {
    const myProj = projects.filter(p => judge.projects.includes(p.id));
    const done   = myProj.filter(p => hasScored(p.id)).length;
    const pct    = Math.round((done / myProj.length) * 100);
    return (
      <div className="app"><style>{CSS}</style>{backdrop}
        <div className="center"><div className="inner">
          <div className="jh-top">
            <div>
              <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.5rem", marginBottom:".15rem", color:"var(--navy)" }}>My Projects</h2>
              <p style={{ color:"var(--dim)", fontSize:".9rem" }}>Score each project using the rubric</p>
            </div>
            <div className="alias-tag">👤 {judge.alias}</div>
          </div>
          {!isOnline && (
            <div className="offline-banner">
              📵 You're offline — scores are saved locally and will sync when reconnected.
              {offlineQueue.length > 0 && <span className="sync-ct">({offlineQueue.length} pending sync)</span>}
            </div>
          )}
          {locked && <div className="locked-banner">🔒 Judging is currently locked by the administrator.</div>}
          <div className="card" style={{ padding:"1rem 1.2rem" }}>
            <div className="lbl">Scoring Guide</div>
            <div style={{ fontSize:".88rem", color:"var(--text)", lineHeight:1.6 }}>
              <div>0 = not present</div>
              <div>1 or 2 = partial</div>
              <div>2 or 4 = complete</div>
              <div>3 or 6 = exceptional</div>
            </div>
          </div>
          <div className="card" style={{ padding:"1.1rem 1.4rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".45rem" }}>
              <span style={{ fontSize:".83rem" }}>Your Progress</span>
              <span style={{ fontFamily:"var(--ff-m)", fontSize:".9rem", color:"var(--navy)" }}>{done}/{myProj.length} scored</span>
            </div>
            <div className="pbar" style={{ height:"7px" }}><div className="pfill" style={{ width:`${pct}%`, height:"7px" }} /></div>
          </div>
          <div className="card proj-list">
            {myProj.map(proj => {
              const scored = hasScored(proj.id);
              const ex = scores[`${judge.id}_${proj.id}`];
              return (
                <div key={proj.id} className="proj-item"
                  onClick={() => !locked && !judgeValidations[judge.id] && startScoring(proj.id)}
                  style={{ cursor: locked || judgeValidations[judge.id] ? "not-allowed" : "pointer", opacity:scored?.75:1 }}>
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
              <div style={{ fontSize:".82rem", color:"var(--dim)" }}>
                Please review and validate the computed results below.
              </div>
            </div>
          )}
          {done === myProj.length && (() => {
            const myVal = judgeValidations[judge.id];
            if (myVal) return (
              <div className="delib-section">
                <div style={{fontFamily:"var(--ff-d)",fontSize:"1.1rem",color:"var(--navy)",marginBottom:".5rem"}}>
                  ✅ Results Validated
                </div>
                <div className={`val-status-pill ${myVal.approved ? "approved" : "concern"}`}>
                  {myVal.approved ? "✓ You approved the computed results" : "⚠ You flagged a concern"}
                </div>
                {myVal.comment && <div style={{fontSize:".82rem",color:"var(--dim)",marginTop:".5rem"}}>Your note: "{myVal.comment}"</div>}
                <button className="btn sec sm" style={{marginTop:"1rem",width:"auto"}} onClick={() => {
                  setJudgeValidations(p => { const n={...p}; delete n[judge.id]; return n; });
                  supabase.from("validations").delete().eq("judge_id", judge.id);
                  setShowValForm(false); setValComment("");
                }}>Revise my validation</button>
              </div>
            );
            return (
              <div className="delib-section">
                <div style={{fontFamily:"var(--ff-d)",fontSize:"1.1rem",color:"var(--navy)",marginBottom:".3rem"}}>
                  📋 Validate Computed Results
                </div>
                <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:"1rem",lineHeight:1.6}}>
                  Review the system-computed rankings and confirm they look correct. If you have a concern, flag it for the admin to review.
                </p>
                <div style={{marginBottom:"1rem"}}>
                  {rankedProjects().filter(p => myProj.some(mp => mp.id === p.id)).map((p, i) => (
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:".55rem .75rem",borderBottom:"1px solid var(--bd)",fontSize:".88rem"}}>
                      <span style={{color:"var(--dim)",fontFamily:"var(--ff-m)",marginRight:".5rem"}}>{i+1}.</span>
                      <span style={{flex:1}}>{p.title}</span>
                      <span style={{fontFamily:"var(--ff-m)",color:"var(--navy)",fontWeight:600}}>{p.avg ?? "—"} pts</span>
                    </div>
                  ))}
                </div>
                {showValForm && (
                  <div style={{marginBottom:".75rem"}}>
                    <div className="lbl">Comment (optional)</div>
                    <textarea placeholder="Describe your concern or observation..." value={valComment} onChange={e => setValComment(e.target.value)} rows={3} />
                  </div>
                )}
                <div style={{display:"flex",gap:".65rem",flexWrap:"wrap"}}>
                  <button className="btn sm" style={{width:"auto",background:"var(--green)"}} onClick={() => submitJudgeValidation(true)}>
                    ✓ Approve Results
                  </button>
                  {!showValForm
                    ? <button className="btn sec sm" style={{width:"auto"}} onClick={() => setShowValForm(true)}>⚠ Flag a Concern</button>
                    : <button className="btn danger sm" style={{width:"auto"}} onClick={() => submitJudgeValidation(false)}>Submit Concern</button>
                  }
                </div>
              </div>
            );
          })()}
          {deliberationOpen && (
            <div className="delib-section" style={{marginTop:"1rem"}}>
              <div style={{fontFamily:"var(--ff-d)",fontSize:"1.1rem",color:"var(--navy)",marginBottom:".3rem"}}>
                💬 Deliberation Notes
              </div>
              <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:"1rem",lineHeight:1.6}}>
                Admin has opened deliberation. Add a recommendation and optional comment for each project to help inform the final award decision.
              </p>
              {myProj.map(proj => {
                const noteKey = `${judge.id}_${proj.id}`;
                const existing = deliberationNotes[noteKey];
                const draft = delibDrafts[proj.id] || { comment: existing?.comment || "", rec: existing?.recommendation || "Pending", flagged: existing?.flagged || false };
                return (
                  <div key={proj.id} className="delib-proj">
                    <div className="delib-proj-head">
                      <div>
                        <div style={{fontFamily:"var(--ff-m)",fontSize:".73rem",color:"var(--navy)"}}>#{proj.num}</div>
                        <div style={{fontWeight:600,fontSize:".88rem"}}>{proj.title}</div>
                        <div style={{fontSize:".75rem",color:"var(--dim)"}}>{proj.cat} · Grade {proj.grade}</div>
                      </div>
                      {existing && <span className="delib-submitted">✓ Submitted</span>}
                    </div>
                    <div style={{marginBottom:".5rem"}}>
                      <div className="lbl">Recommendation</div>
                      <select className="delib-rec-select"
                        value={draft.rec}
                        onChange={e => setDelibDrafts(p => ({...p, [proj.id]: {...(delibDrafts[proj.id]||draft), rec: e.target.value}}))}>
                        <option value="Pending">Pending</option>
                        {RECOMMENDATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div style={{marginBottom:".5rem"}}>
                      <div className="lbl">Comment (optional)</div>
                      <textarea rows={2} placeholder="Your observations about this project…"
                        value={draft.comment}
                        onChange={e => setDelibDrafts(p => ({...p, [proj.id]: {...(delibDrafts[proj.id]||draft), comment: e.target.value}}))} />
                    </div>
                    <label className="delib-flag-wrap">
                      <input type="checkbox" checked={draft.flagged || false}
                        onChange={e => setDelibDrafts(p => ({...p, [proj.id]: {...(delibDrafts[proj.id]||draft), flagged: e.target.checked}}))} />
                      <span style={{fontSize:".88rem"}}>🚩 Flag this project for discussion</span>
                    </label>
                    <button className="btn sm" style={{marginTop:".75rem",width:"auto"}}
                      onClick={async () => {
                        const d = delibDrafts[proj.id] || draft;
                        const entry = { comment: d.comment, recommendation: d.rec, flagged: d.flagged||false, submittedAt: Date.now() };
                        setDeliberationNotes(p => ({...p, [noteKey]: entry}));
                        await supabase.from("deliberation_notes").upsert({
                          judge_id: judge.id, project_id: proj.id,
                          comment: d.comment, recommendation: d.rec, flagged: d.flagged||false,
                        }, { onConflict: "judge_id,project_id" });
                        addLog(`${judge.alias} submitted deliberation note for Project #${proj.num}`);
                        addItLog("INFO","JUDGE","DELIB_NOTE_SUBMITTED","Judge submitted deliberation note",
                          { judgeId: judge.id, alias: judge.alias, projectId: proj.id, projectNum: proj.num, recommendation: d.rec, flagged: d.flagged||false });
                      }}>
                      {existing ? "Update Note" : "Submit Note"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {offlineQueue.length > 0 && (
            <div className="sync-banner" style={{ marginTop:".85rem" }}>
              <div>
                ⚠ {offlineQueue.length} score{offlineQueue.length!==1?"s":""} currently saved only on this device (not yet in Supabase).
              </div>
              {isOnline && <button className="btn sec sm" style={{width:"auto"}} onClick={flushOfflineQueue}>Sync Now</button>}
            </div>
          )}
          <div className="sync-meta" style={{ marginTop:".3rem", marginBottom:".7rem" }}>
            Sync status: {offlineQueue.length > 0 ? "Pending local saves" : "All local scores synced"} · Last sync: {lastSyncAt ? fmtFull(lastSyncAt) : "Not yet"}
          </div>
          <button className="btn sec" style={{ marginTop:".85rem" }} onClick={() => {
            if (done < myProj.length) {
              const confirmed = window.confirm("You have unfinished scoring. Are you sure you want to sign out?");
              if (!confirmed) return;
            }
            setJudge(null);
            ["sf_judge_id","sf_judge_data","sf_scores_cache","sf_offline_queue"].forEach(k => localStorage.removeItem(k));
            setView("landing");
          }}>Sign Out</button>
        </div></div>
      </div>
    );
  }

  /* JUDGE SCORING */
  if (view === "judge-scoring" && scoringPid) {
    const proj = projects.find(p => p.id === scoringPid);
    return (
      <div className="app"><style>{CSS}</style>{backdrop}
        <div className="center" style={{ justifyContent:"flex-start", paddingTop:"2rem" }}>
          <div className="inner">
            <button className="back" onClick={() => setView("judge-home")}>← Back to my projects</button>
            {!isOnline && (
              <div className="offline-banner">
                📵 Offline — score will be saved locally and synced when reconnected.
              </div>
            )}
            {offlineQueue.length > 0 && (
              <div className="sync-banner">
                ⚠ {offlineQueue.length} pending local save{offlineQueue.length!==1?"s":""} not yet in backend.
              </div>
            )}
            <div className="sc-header">
              <div style={{ fontFamily:"var(--ff-m)", fontSize:".78rem", color:"var(--navy)", marginBottom:".2rem" }}>PROJECT #{proj.num}</div>
              <h2>{proj.title}</h2>
              <div style={{ fontSize:".78rem", color:"var(--dim)", marginTop:".35rem" }}>{proj.cat} · Grade {proj.grade} · {getDivision(proj.grade)}</div>
            </div>
            {RUBRIC.map(r => {
              if (r.id === "abstract" && !requiresAbstract(proj)) return null;
              return (
                <div className="rub-item" key={r.id}>
                  <div className="rub-top">
                    <span className="rub-lbl">{r.label}</span>
                    <span className="rub-val">{draftSc[r.id] !== undefined ? draftSc[r.id] : "—"} / {r.max}</span>
                  </div>
                  <div className="rub-desc">{r.desc}</div>
                  <div className="rub-steps">
                    {r.steps.map(v => (
                      <button key={v} type="button"
                        className={"rub-step-btn" + (draftSc[r.id] === v ? " selected" : "")}
                        onClick={() => setDraftSc(p => ({ ...p, [r.id]: v }))}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {hasZeroScore() && (
              <div className="val-tie-alert" style={{ marginBottom:"1rem" }}>
                ⚠️ <strong>Grades 5 and up must have no zeroes.</strong> Please review your scores — at least one criterion is scored 0.
              </div>
            )}
            <div className="card">
              <div className="lbl">Judge Notes (Optional)</div>
              <textarea placeholder="Add observations about this project…" value={draftNotes} onChange={e => setDraftNotes(e.target.value)} />
            </div>
            <div className="sc-total">
              <div><div className="lbl">Total Score</div><div style={{ fontSize:".76rem", color:"var(--dim)" }}>Out of {maxDraftScore()} points</div></div>
              <div className="sc-total-num">{draftTotal()}</div>
            </div>
            <button className="btn" onClick={submitScore} disabled={!allMoved() || hasZeroScore()}>Submit Score →</button>
            {hasZeroScore() && <p style={{ textAlign:"center", fontSize:".72rem", color:"var(--red)", marginTop:".4rem" }}>Remove all zero scores before submitting (Grades 5+ rule).</p>}
            <p style={{ textAlign:"center", fontSize:".72rem", color:"var(--dim)", marginTop:".7rem" }}>You may revise this before judging closes.</p>
          </div>
        </div>
      </div>
    );
  }

  /* ADMIN LOGIN */
  if (view === "admin-login") return (
    <div className="app"><style>{CSS}</style>{backdrop}
      <div className="center"><div className="inner">
        <button className="back" onClick={() => { setView("landing"); setAdminErr(""); setAdminPass(""); }}>← Back</button>
        <div className="card">
          <div style={{ textAlign:"center", marginBottom:"1.5rem" }}>
            <div style={{ fontSize:"2.5rem", marginBottom:".5rem" }}>🛡️</div>
            <h2 style={{ fontFamily:"var(--ff-d)", fontSize:"1.5rem", marginBottom:".4rem", color:"var(--navy)" }}>Admin Access</h2>
            <p style={{ color:"var(--dim)", fontSize:".95rem" }}>Restricted to authorized science fair coordinators.</p>
          </div>
          <div style={{ marginBottom:"1rem" }}>
            <div className="lbl">Password</div>
            <input type="password" placeholder="Enter admin password" value={adminPass}
              onChange={e => { setAdminPass(e.target.value); setAdminErr(""); }}
              onKeyDown={e => e.key==="Enter" && handleAdminLogin()} />
            {adminErr && <div className="err">⚠ {adminErr}</div>}
          </div>
          <button className="btn" onClick={handleAdminLogin}
            disabled={!!(adminLockoutUntil && Date.now() < adminLockoutUntil)}>
            Access Dashboard →
          </button>
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
      { id:"deliberation", ico:"🤝", label:`Validation${resultsFinalized ? " ✓" : consensusReached() ? " 🟢" : ""}` },
      { id:"share",    ico:"🔗", label:`Share${resultsFinalized ? " 🔗" : ""}` },
      { id:"export",   ico:"📦", label:"Score Export"  },
      { id:"itlogs",   ico:"🖥️", label:"IT Logs"      },
    ];

    return (
      <div className="app"><style>{CSS}</style>{backdrop}
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
            <div className="nav-it" style={{ color:locked?"#fca5a5":"#86efac" }}
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
                      <div>All deliberation notes removed</div>
                      <div>All final decisions cleared</div>
                      <div>Share link revoked</div>
                      <div>Judging lock reset to open</div>
                    </div>
                    <div style={{background:"var(--green-l)",border:"1px solid #05966920",borderRadius:"10px",
                      padding:".7rem 1.1rem",marginBottom:"1.5rem",textAlign:"left"}}>
                      <div style={{fontSize:".88rem",color:"var(--green)",display:"flex",gap:".4rem"}}>
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
                          background:"var(--bg)", border:`1.5px solid ${resetPinErr?"var(--red)":"var(--bd)"}`,
                          borderRadius:"8px", padding:".8rem 1rem", color:"var(--text)", outline:"none"
                        }}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g,"").slice(0,4);
                          setResetPin(val);
                          setResetPinErr("");
                          if (val.length === 4) {
                            if (val === IT_PIN) {
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

          {/* ── TRANSFER PIN MODAL ── */}
          {showTransferPinModal && (
            <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget){ setShowTransferPinModal(false); setTransferPin(""); setTransferPinErr(""); }}}>
              <div className="modal-box">
                <div className="ico">🔐</div>
                <h2>Approve Device Transfer</h2>
                <p>Enter the IT PIN to approve a one-time device transfer for <strong>{transferPinAlias}</strong>.</p>
                <p style={{fontSize:".8rem",color:"var(--dim)",marginTop:".4rem"}}>Approval expires in 10 minutes.</p>
                <div className="modal-pin-label" style={{marginTop:"1.25rem"}}>IT PIN</div>
                <div className="modal-pin-dots">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={`modal-pin-dot ${transferPin.length > i ? "filled" : ""}`} />
                  ))}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:".25rem"}}>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={transferPin}
                    autoFocus
                    style={{
                      width:"160px", textAlign:"center", letterSpacing:".5em",
                      fontFamily:"var(--ff-m)", fontSize:"1.3rem",
                      background:"var(--bg)", border:`1.5px solid ${transferPinErr?"var(--red)":"var(--bd)"}`,
                      borderRadius:"8px", padding:".8rem 1rem", color:"var(--text)", outline:"none"
                    }}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g,"").slice(0,4);
                      setTransferPin(val);
                      setTransferPinErr("");
                      if (val.length === 4) confirmTransfer();
                    }}
                  />
                  {transferPinErr && <div style={{color:"var(--red)",fontSize:".8rem",marginTop:".25rem"}}>{transferPinErr}</div>}
                </div>
                <div className="modal-btn-row">
                  <button className="btn sec" onClick={() => { setShowTransferPinModal(false); setTransferPin(""); setTransferPinErr(""); }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── DELETE PROJECT MODAL ── */}
          {showDeleteConfirm && deleteProjectId && (() => {
            const proj = projects.find(p => p.id === deleteProjectId);
            return (
              <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget){ setShowDeleteConfirm(false); setDeleteProjectId(null); }}}>
                <div className="modal-box">
                  <div className="ico">🗑️</div>
                  <h2>Remove Project?</h2>
                  <p>Remove <strong>"{proj?.title}"</strong> and all its scores, deliberation notes, and decisions?</p>
                  <p style={{color:"var(--red)",fontSize:".85rem",marginTop:".5rem"}}>This cannot be undone.</p>
                  <div className="modal-btn-row" style={{marginTop:"1.5rem"}}>
                    <button className="btn sec" onClick={() => { setShowDeleteConfirm(false); setDeleteProjectId(null); }}>Cancel</button>
                    <button className="btn danger sm" style={{width:"auto"}} onClick={() => { removeProject(deleteProjectId); setShowDeleteConfirm(false); setDeleteProjectId(null); }}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="adm-main">

            {/* OVERVIEW */}
            {adminTab==="overview" && <>
              <div className="adm-h1">Dashboard Overview</div>
              <div className="adm-sub">Live judging progress · Science Fair SY 2025-2026</div>
              {locked && <div className="locked-banner">🔒 Judging LOCKED — judges cannot submit scores</div>}
              <div className="card" style={{ marginBottom:".9rem" }}>
                <div className="lbl">Sync Health (This Device)</div>
                <div style={{fontSize:".9rem", color: offlineQueue.length > 0 ? "var(--amber)" : "var(--green)", fontWeight:600, marginBottom:".2rem"}}>
                  {offlineQueue.length > 0
                    ? `${offlineQueue.length} local score${offlineQueue.length!==1?"s":""} waiting to sync`
                    : "All local scores synced to Supabase"}
                </div>
                <div className="sync-meta">Last successful sync: {lastSyncAt ? fmtFull(lastSyncAt) : "Not yet"}</div>
              </div>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-v" style={{color:"var(--navy)"}}>{judges.length}/{maxJudges}</div><div className="stat-l">Judges</div></div>
                <div className="stat-card"><div className="stat-v" style={{color:"var(--blue)"}}>{projects.length}</div><div className="stat-l">Projects</div></div>
                <div className="stat-card"><div className="stat-v" style={{color:"var(--green)"}}>{totalScored()}</div><div className="stat-l">Scores In</div></div>
                <div className="stat-card">
                  <div className="stat-v" style={{color:completion<50?"var(--red)":completion<80?"var(--amber)":"var(--green)"}}>{completion}%</div>
                  <div className="stat-l">Completion</div>
                </div>
              </div>
              {judges.length === 0 && (
                <div className="card" style={{backgroundColor:"var(--s1)",border:"1px solid var(--bd)"}}>
                  <div style={{display:"flex",gap:"1rem",alignItems:"flex-end"}}>
                    <div style={{flex:1}}>
                      <div className="lbl">Max Judges for This Event</div>
                      <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:".5rem"}}>Set before any judges register. This will be locked once judging begins.</p>
                      <div style={{display:"flex",gap:".5rem"}}>
                        <input type="number" min="1" max="100" value={maxJudgesDraft}
                          onChange={e => { setMaxJudgesDraft(e.target.value); setMaxJudgesErr(""); }}
                          style={{width:"80px",padding:".4rem",border:"1px solid var(--bd)",borderRadius:"var(--r)",fontFamily:"var(--ff-m)"}}
                          onKeyDown={e => e.key === "Enter" && updateMaxJudges(e.target.value)}
                          onBlur={e => updateMaxJudges(e.target.value)}
                        />
                        <button className="btn sm" style={{width:"auto"}} onClick={() => updateMaxJudges(maxJudgesDraft)}>Save</button>
                      </div>
                      {maxJudgesErr && <div style={{color:"var(--red)",fontSize:".8rem",marginTop:".4rem"}}>{maxJudgesErr}</div>}
                    </div>
                  </div>
                </div>
              )}
              {judges.length > 0 && (
                <div className="card" style={{backgroundColor:"var(--s1)",border:"1px solid var(--bd)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div className="lbl">Max Judges Setting</div>
                      <p style={{fontSize:".85rem",color:"var(--dim)"}}>🔒 Locked — max judges set to {maxJudges}. Reset data to change.</p>
                    </div>
                  </div>
                </div>
              )}
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
                  {(() => {
                    const all = rankedProjects();
                    const scored = all.filter(p => p.avg !== null);
                    const unscored = all.filter(p => p.avg === null);
                    return (
                      <table>
                        <thead><tr><th>#</th><th>Project</th><th>Category</th><th>Avg</th><th>Reviews</th></tr></thead>
                        <tbody>
                          {scored.map((p,i) => (
                            <tr key={p.id}>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--dim)"}}>{i+1}</td>
                              <td style={{maxWidth:"200px"}}>{p.title}</td>
                              <td><span className="badge bb">{p.cat}</span></td>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--navy)"}}>{p.avg}</td>
                              <td>{p.revs}</td>
                            </tr>
                          ))}
                          {unscored.length > 0 && (
                            <tr><td colSpan={5} style={{textAlign:"center",fontSize:".75rem",color:"var(--dim)",padding:".4rem .75rem",background:"var(--s1)",fontFamily:"var(--ff-m)",letterSpacing:".05em"}}>NOT YET SCORED</td></tr>
                          )}
                          {unscored.map(p => (
                            <tr key={p.id} style={{opacity:.5}}>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--dim)"}}>—</td>
                              <td style={{maxWidth:"200px"}}>{p.title}</td>
                              <td><span className="badge bb">{p.cat}</span></td>
                              <td style={{fontFamily:"var(--ff-m)",color:"var(--dim)"}}>—</td>
                              <td>{p.revs}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            </>}

            {/* JUDGES */}
            {adminTab==="judges" && <>
              <div className="adm-h1">Judge Management</div>
              <div className="adm-sub">Monitor activity and completion per judge · approve device transfer only when needed</div>
              <div className="card"><div className="tbl-wrap">
                <table>
                  <thead><tr><th>Alias</th><th>Joined</th><th>Assigned</th><th>Progress</th><th>Status</th><th>Transfer</th></tr></thead>
                  <tbody>
                    {judges.map(j => {
                      const {done,total,pct} = judgeComp(j);
                      const transferOpen = !!transferAllowances[j.alias] && Date.now() <= transferAllowances[j.alias];
                      return (
                        <tr key={j.id}>
                          <td style={{fontFamily:"var(--ff-m)",color:"var(--navy)"}}>{j.alias}</td>
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
                          <td>
                            <button
                              className="btn sec sm"
                              style={{width:"auto"}}
                              onClick={() => allowJudgeTransfer(j.alias)}
                            >
                              {transferOpen ? "Approved (active)" : "Allow Transfer"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div></div>
            </>}

            {/* PROJECTS */}
            {adminTab==="projects" && <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:".5rem"}}>
                <div>
                  <div className="adm-h1">Projects Overview</div>
                  <div className="adm-sub">Manage projects, view rubric breakdown, and control project access</div>
                </div>
                <button className="btn sm" style={{width:"auto"}} onClick={() => {
                  setProjForm({ title:"", cat:"Biology", grade:"", num:nextProjectNum() });
                  setShowAddProject(true); setEditingProject(null);
                }}>
                  + Add Project
                </button>
              </div>

              {/* Add / Edit project form */}
              {(showAddProject || editingProject) && (
                <div className="proj-form">
                  <div style={{fontWeight:600,marginBottom:".75rem",fontSize:".95rem"}}>
                    {editingProject ? "Edit Project" : "Add New Project"}
                  </div>
                  <div className="proj-form-grid full">
                    <div>
                      <div className="lbl">Title</div>
                      <input type="text" placeholder="Project title..." value={projForm.title}
                        onChange={e => setProjForm(f => ({...f, title:e.target.value}))} />
                    </div>
                  </div>
                  <div className="proj-form-grid" style={{marginTop:".5rem"}}>
                    <div>
                      <div className="lbl">Category</div>
                      <select className="delib-rec-select" value={projForm.cat}
                        onChange={e => setProjForm(f => ({...f, cat:e.target.value}))}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="lbl">Grade</div>
                      <input type="text" placeholder="e.g. 9" value={projForm.grade}
                        onChange={e => setProjForm(f => ({...f, grade:e.target.value}))} />
                    </div>
                  </div>
                  <div className="proj-form-grid" style={{marginTop:".5rem"}}>
                    <div>
                      <div className="lbl">Project Number</div>
                      <input type="text" placeholder="e.g. 001" value={projForm.num} style={{fontFamily:"var(--ff-m)"}}
                        onChange={e => setProjForm(f => ({...f, num:e.target.value}))} />
                    </div>
                    <div style={{display:"flex",alignItems:"flex-end",gap:".5rem",paddingBottom:".1rem"}}>
                      <button className="btn sm" style={{width:"auto"}}
                        disabled={!projForm.title.trim()}
                        onClick={() => editingProject ? updateProject(editingProject) : addProject()}>
                        {editingProject ? "Save Changes" : "Add Project"}
                      </button>
                      <button className="btn sec sm" style={{width:"auto"}}
                        onClick={() => { setShowAddProject(false); setEditingProject(null); setProjForm({ title:"", cat:"Biology", grade:"", num:"" }); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Project cards */}
              {projects.map(p => {
                const hits = Object.entries(scores).filter(([k]) => k.endsWith(`_${p.id}`));
                const avg  = projAvg(p.id);
                const assignedJudges = judges.filter(j => j.projects.includes(p.id));
                return (
                  <div className={`proj-mgmt-card ${p.locked?"is-locked":""}`} key={p.id}>
                    <div className="proj-mgmt-head">
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:".5rem",marginBottom:".2rem",flexWrap:"wrap"}}>
                          <span style={{fontFamily:"var(--ff-m)",fontSize:".78rem",color:"var(--navy)"}}>#{p.num} · {p.cat}</span>
                          {p.locked && <span className="proj-lock-badge">🔒 Locked</span>}
                        </div>
                        <div style={{fontWeight:600,marginBottom:".2rem",lineHeight:1.3}}>{p.title}</div>
                        <div style={{fontSize:".76rem",color:"var(--dim)"}}>
                          Grade {p.grade} · {hits.length} review{hits.length!==1?"s":""}
                          {assignedJudges.length > 0 && ` · ${assignedJudges.length} judge${assignedJudges.length!==1?"s":""} assigned`}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"flex-start",gap:"1rem"}}>
                        <div className="proj-mgmt-actions">
                          <button className={`proj-act-btn ${p.locked?"unlock":"lock"}`}
                            onClick={() => toggleProjectLock(p.id)}
                            title={p.locked ? "Unlock project" : "Lock project"}>
                            {p.locked ? "🔓 Unlock" : "🔒 Lock"}
                          </button>
                          {!p.locked && (
                            <>
                              <button className="proj-act-btn edit"
                                onClick={() => {
                                  setEditingProject(p.id);
                                  setProjForm({ title:p.title, cat:p.cat, grade:p.grade, num:p.num });
                                  setShowAddProject(false);
                                }}
                                title="Edit project">
                                ✏️ Edit
                              </button>
                              <button className="proj-act-btn del"
                                onClick={() => { setDeleteProjectId(p.id); setShowDeleteConfirm(true); }}
                                title="Remove project">
                                🗑 Remove
                              </button>
                            </>
                          )}
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontFamily:"var(--ff-d)",fontSize:"1.8rem",color:avg?"var(--navy)":"var(--dim)"}}>{avg??"—"}</div>
                          <div style={{fontSize:".7rem",color:"var(--dim)"}}>avg / {requiresAbstract(p)?42:36}</div>
                        </div>
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
              {projects.length === 0 && (
                <div className="all-done">
                  <div style={{fontSize:"2rem",marginBottom:".4rem"}}>📋</div>
                  <div style={{fontWeight:600}}>No projects yet</div>
                  <div style={{fontSize:".82rem",color:"var(--dim)",marginTop:".25rem"}}>Click "Add Project" to get started.</div>
                </div>
              )}
            </>}

            {/* ACTIVITY */}
            {adminTab==="activity" && <>
              <div className="adm-h1">Activity Log</div>
              <div className="adm-sub">Timestamped record of all actions</div>
              <div style={{marginBottom:".75rem"}}>
                <input type="text" placeholder="Filter by keyword…" value={activityFilter}
                  onChange={e => setActivityFilter(e.target.value)}
                  style={{width:"100%",padding:".6rem 1rem",border:"1.5px solid var(--bd)",borderRadius:"8px",fontFamily:"var(--ff-b)",fontSize:".9rem",outline:"none"}} />
              </div>
              <div className="card">
                {log
                  .filter(e => !activityFilter || e.msg.toLowerCase().includes(activityFilter.toLowerCase()))
                  .map((e,i) => (
                    <div className="log-row" key={i}>
                      <div className="log-t">{fmtFull(e.time)}</div>
                      <div>{e.msg}</div>
                    </div>
                  ))}
                {log.filter(e => !activityFilter || e.msg.toLowerCase().includes(activityFilter.toLowerCase())).length === 0 && (
                  <div style={{color:"var(--dim)",textAlign:"center",padding:"1rem",fontSize:".88rem"}}>No matching entries.</div>
                )}
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
                        <span><strong>{a.judge}</strong> scored <strong>{a.score}/42</strong> — group avg is <strong>{a.avg}</strong>. Deviation &gt; 8 pts.</span>
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

            {/* DELIBERATION */}
            {adminTab==="deliberation" && (() => {
              const vp = valProgress();
              const tie = hasTie();
              const consensus = consensusReached();
              const canFinalize = adminValidation?.approved && !deliberationOpen;
              return <>
                <div className="adm-h1">Validation &amp; Deliberation</div>
                <div className="adm-sub">Review computed results, reach consensus, and finalize before sharing</div>

                {/* Finalized banner */}
                {resultsFinalized && (
                  <div className="val-finalized-banner">
                    <span style={{fontSize:"1.5rem"}}>✅</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:".95rem"}}>Results are finalized</div>
                      <div style={{fontSize:".78rem",opacity:.8}}>Public sharing is now available from the Share tab.</div>
                    </div>
                    <button className="btn danger sm" style={{width:"auto",marginLeft:"auto"}} onClick={async () => { setResultsFinalized(false); await supabase.from("app_settings").upsert({ key: "results_finalized", value: "false" }); addLog("Admin reopened results for revision"); }}>Reopen</button>
                  </div>
                )}

                {/* Tie alert */}
                {tie && !resultsFinalized && (
                  <div className="val-tie-alert">
                    <span style={{fontSize:"1.2rem"}}>⚠️</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:".88rem"}}>Tie detected in rankings</div>
                      <div style={{fontSize:".76rem",opacity:.85}}>Two or more projects share the same average score. Deliberation is recommended.</div>
                    </div>
                    {!deliberationOpen && <button className="btn amber sm" style={{width:"auto"}} onClick={() => openDeliberation("tie")}>Open Deliberation</button>}
                  </div>
                )}

                {/* Consensus status */}
                {!resultsFinalized && (
                  <div className={`val-consensus-card ${consensus ? "reached" : ""}`}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:".5rem"}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:".92rem"}}>{consensus ? "✅ Consensus reached" : "⏳ Awaiting consensus"}</div>
                        <div style={{fontSize:".76rem",color:"var(--dim)",marginTop:".15rem"}}>
                          {consensus ? "All reviewers approved the computed results. You can finalize and share." : "All judges who have completed scoring and the admin must approve before results can be finalized."}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Judge validation status */}
                <div className="card" style={{marginBottom:"1rem"}}>
                  <div className="sec-title">Judge Validations</div>
                  <div style={{display:"flex",gap:".75rem",marginBottom:"1rem",flexWrap:"wrap"}}>
                    <div className="val-stat-pill green">{vp.approved} Approved</div>
                    <div className="val-stat-pill red">{vp.flagged} Concerned</div>
                    <div className="val-stat-pill dim">{vp.pending} Pending</div>
                  </div>
                  {completedJudges().length === 0
                    ? <div style={{fontSize:".82rem",color:"var(--dim)"}}>No judges have completed scoring yet.</div>
                    : completedJudges().map(j => {
                        const v = judgeValidations[j.id];
                        return (
                          <div key={j.id} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".5rem 0",borderBottom:"1px solid var(--bd)"}}>
                            <div style={{flex:1,fontSize:".88rem",fontWeight:500}}>{j.alias}</div>
                            {v
                              ? <>
                                  <span className={`val-status-pill ${v.approved ? "approved" : "concern"}`}>{v.approved ? "✓ Approved" : "⚠ Concern"}</span>
                                  {v.comment && <span style={{fontSize:".72rem",color:"var(--dim)",maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{v.comment}"</span>}
                                </>
                              : <span className="val-status-pill pending">Pending</span>
                            }
                          </div>
                        );
                      })
                  }
                </div>

                {/* Admin validation */}
                <div className="card" style={{marginBottom:"1rem"}}>
                  <div className="sec-title">Your Validation (Admin)</div>
                  {adminValidation ? (
                    <div>
                      <div className={`val-status-pill ${adminValidation.approved ? "approved" : "concern"}`} style={{marginBottom:".5rem"}}>
                        {adminValidation.approved ? "✓ You approved the computed results" : "⚠ You flagged a concern"}
                      </div>
                      {adminValidation.comment && <div style={{fontSize:".8rem",color:"var(--dim)",marginBottom:".75rem"}}>Note: "{adminValidation.comment}"</div>}
                      <button className="btn sec sm" style={{width:"auto"}} onClick={() => { setAdminValidation(null); setValComment(""); setShowValForm(false); }}>Revise</button>
                    </div>
                  ) : (
                    <div>
                      <p style={{fontSize:".83rem",color:"var(--dim)",marginBottom:".85rem",lineHeight:1.5}}>Review the auto-computed rankings and confirm they look correct before finalizing.</p>
                      {showValForm && (
                        <div style={{marginBottom:".75rem"}}>
                          <div className="lbl">Comment (optional)</div>
                          <textarea placeholder="Describe your concern..." value={valComment} onChange={e => setValComment(e.target.value)} rows={2} />
                        </div>
                      )}
                      <div style={{display:"flex",gap:".65rem",flexWrap:"wrap"}}>
                        <button className="btn sm" style={{width:"auto",background:"var(--green)"}} onClick={() => submitAdminValidation(true)}>✓ Approve Results</button>
                        {!showValForm
                          ? <button className="btn sec sm" style={{width:"auto"}} onClick={() => setShowValForm(true)}>⚠ Flag a Concern</button>
                          : <button className="btn danger sm" style={{width:"auto"}} onClick={() => submitAdminValidation(false)}>Submit Concern</button>
                        }
                      </div>
                    </div>
                  )}
                </div>

                {/* Deliberation section */}
                {!resultsFinalized && (
                  <div className="card" style={{marginBottom:"1rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:".5rem",marginBottom:".75rem"}}>
                      <div>
                        <div className="sec-title" style={{marginBottom:".1rem"}}>Deliberation</div>
                        <div style={{fontSize:".76rem",color:"var(--dim)"}}>
                          {deliberationOpen
                            ? `Open · Reason: ${deliberationReason === "tie" ? "Tied scores" : "Admin initiated"}`
                            : "Not active · Triggered automatically on ties or manually by admin"}
                        </div>
                      </div>
                      {deliberationOpen
                        ? <button className="btn sec sm" style={{width:"auto"}} onClick={closeDeliberation}>Close Deliberation</button>
                        : <button className="btn sec sm" style={{width:"auto"}} onClick={() => openDeliberation("manual")}>Open Manually</button>
                      }
                    </div>
                    {deliberationOpen && rankedProjects().map((p, i) => {
                      const notes = getDelibNotesForProject(p.id);
                      const flags = getFlagCount(p.id);
                      const decision = finalDecisions[p.id];
                      return (
                        <div key={p.id} style={{borderTop:"1px solid var(--bd)",paddingTop:".85rem",marginTop:".85rem"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"1rem",flexWrap:"wrap",marginBottom:".5rem"}}>
                            <div>
                              <div style={{fontFamily:"var(--ff-m)",fontSize:".73rem",color:"var(--navy)"}}>#{p.num} · Rank {i+1}</div>
                              <div style={{fontWeight:600,fontSize:".92rem",lineHeight:1.3}}>{p.title}</div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <div style={{fontFamily:"var(--ff-d)",fontSize:"1.5rem",color:"var(--navy)"}}>{p.avg ?? "—"}</div>
                              <div style={{fontSize:".65rem",color:"var(--dim)"}}>avg / 42</div>
                            </div>
                          </div>
                          {/* Per-judge score breakdown */}
                          {(() => {
                            const judgeScores = judges
                              .map(j => ({ alias: j.alias, sc: scores[`${j.id}_${p.id}`] }))
                              .filter(x => x.sc);
                            if (!judgeScores.length) return null;
                            return (
                              <div style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:"8px",padding:".65rem .85rem",marginBottom:".6rem"}}>
                                <div style={{fontSize:".7rem",fontFamily:"var(--ff-m)",color:"var(--dim)",marginBottom:".45rem",textTransform:"uppercase",letterSpacing:".04em"}}>Judge Scores</div>
                                {judgeScores.map(({alias, sc}) => {
                                  const total = getTotal(sc);
                                  return (
                                    <div key={alias} style={{marginBottom:".5rem"}}>
                                      <div style={{display:"flex",alignItems:"center",gap:".6rem",marginBottom:".2rem"}}>
                                        <span style={{fontFamily:"var(--ff-m)",fontSize:".75rem",color:"var(--dim)",width:"60px",flexShrink:0}}>{alias}</span>
                                        <div className="pbar" style={{flex:1,height:"5px"}}>
                                          <div className="pfill" style={{width:`${(total/42)*100}%`,height:"5px"}} />
                                        </div>
                                        <span style={{fontFamily:"var(--ff-m)",fontSize:".78rem",fontWeight:600,width:"42px",textAlign:"right",color:"var(--navy)"}}>{total}/42</span>
                                      </div>
                                      {sc.notes && sc.notes.trim() && (
                                        <div style={{marginLeft:"68px",fontSize:".78rem",color:"var(--dim)",fontStyle:"italic",lineHeight:1.5,borderLeft:"2px solid var(--bd)",paddingLeft:".5rem"}}>
                                          "{sc.notes.trim()}"
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {flags > 0 && <div style={{display:"inline-flex",alignItems:"center",gap:".3rem",fontSize:".73rem",fontFamily:"var(--ff-m)",padding:".2rem .5rem",background:"var(--amber-l)",color:"var(--amber)",borderRadius:"6px",marginBottom:".5rem"}}>🚩 {flags} flag{flags!==1?"s":""} for discussion</div>}
                          {notes.length > 0 && notes.map((n, ni) => (
                            <div key={ni} className="delib-comment-card">
                              <div className="delib-comment-alias">👤 {n.judgeAlias}</div>
                              {n.comment && <div className="delib-comment-text">"{n.comment}"</div>}
                              <div className="delib-comment-meta">
                                <span className={`delib-rec-pill ${recPillClass(n.recommendation)}`}>{n.recommendation}</span>
                                {n.flagged && <span className="delib-flag-badge">🚩 Flagged</span>}
                              </div>
                            </div>
                          ))}
                          <div style={{marginTop:".5rem"}}>
                            <div style={{display:"flex",gap:".5rem",flexWrap:"wrap",marginBottom:".4rem"}}>
                              <select className="delib-rec-select" style={{flex:1,minWidth:"140px"}}
                                value={decision?.award || "Pending"}
                                onChange={e => setFinalDecisions(prev => ({ ...prev, [p.id]: { ...prev[p.id], award: e.target.value, finalized:false, adminNotes:prev[p.id]?.adminNotes||"" } }))}>
                                {AWARD_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                              <button className="btn sm" style={{width:"auto"}}
                                disabled={!decision?.award || decision?.award==="Pending"}
                                onClick={() => saveFinalDecision(p.id, decision?.award||"Pending", decision?.adminNotes||"")}>
                                {decision?.finalized ? "✓ Saved" : "Save Award"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Finalize button */}
                {!resultsFinalized && (
                  <div style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:"var(--r)",padding:"1.25rem",marginBottom:"1rem"}}>
                    <div style={{fontWeight:600,marginBottom:".3rem"}}>Finalize &amp; Enable Sharing</div>
                    <div style={{fontSize:".8rem",color:"var(--dim)",marginBottom:"1rem",lineHeight:1.5}}>
                      {!adminValidation?.approved ? "You must approve the results before finalizing." :
                       deliberationOpen ? "Close deliberation before finalizing." :
                       "Results are ready to finalize. Once finalized, the Share tab will be unlocked."}
                    </div>
                    <button className="btn" disabled={!canFinalize} onClick={finalizeResults}>
                      🏁 Finalize Results
                    </button>
                  </div>
                )}

                {/* Copy report */}
                <div>
                  <button className="btn sec sm" style={{width:"auto"}} onClick={() => { navigator.clipboard.writeText(buildDelibReport()).catch(()=>{}); setDelibReportCopied(true); setTimeout(()=>setDelibReportCopied(false),2500); }}>
                    {delibReportCopied ? "✓ Copied!" : "📋 Copy Summary Report"}
                  </button>
                </div>
              </>;
            })()}

            {/* SHARE RESULTS */}
            {adminTab==="share" && <>
              <div className="adm-h1">Share Live Results</div>
              <div className="adm-sub">Generate a public link for parents, students, and attendees — no login required to view.</div>

              {/* Not-finalized gate */}
              {!resultsFinalized && (
                <div className="val-tie-alert" style={{marginBottom:"1.2rem"}}>
                  <span style={{fontSize:"1.2rem"}}>🔒</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:".88rem"}}>Results not yet finalized</div>
                    <div style={{fontSize:".76rem",opacity:.85}}>Complete validation and finalize results in the Validation tab before sharing.</div>
                  </div>
                  <button className="btn sm" style={{width:"auto"}} onClick={() => setAdminTab("deliberation")}>Go to Validation →</button>
                </div>
              )}

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
                  <input type="text" value={shareTitle} onChange={e => setShareTitle(e.target.value)} placeholder="Science Fair SY 2025-2026 — Final Results" />
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

                <div style={{background:"var(--s1)",border:"1px solid var(--bd)",borderRadius:"10px",padding:"1rem",marginBottom:"1.2rem"}}>
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

                <button className="btn" onClick={generateLink} disabled={!resultsFinalized}>
                  {isLinkLive() ? "🔄 Regenerate New Link" : "🔗 Generate Live Results Link"}
                </button>
                {!resultsFinalized && <p style={{fontSize:".72rem",color:"var(--dim)",marginTop:".5rem",textAlign:"center"}}>Finalize results first to enable sharing.</p>}
                {isLinkLive() && (
                  <p style={{fontSize:".72rem",color:"var(--amber)",marginTop:".5rem",textAlign:"center"}}>
                    ⚠ Regenerating invalidates the current link immediately.
                  </p>
                )}
              </div>

              {/* CSV Export */}
              {resultsFinalized && (
                <div className="card" style={{background:"var(--s1)"}}>
                  <div style={{fontFamily:"var(--ff-d)",fontSize:"1rem",marginBottom:".5rem"}}>📥 Export Results</div>
                  <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:".75rem"}}>Download a CSV of ranked projects with awards — for school records or regional fair submission.</p>
                  <button className="btn sec sm" style={{width:"auto"}} onClick={exportResultsCSV}>⬇ Download Results CSV</button>
                </div>
              )}

              {/* Security notes */}
              <div className="card sec-notes" style={{background:"var(--s1)"}}>
                <div style={{fontFamily:"var(--ff-d)",fontSize:"1rem",marginBottom:".75rem"}}>🔐 Security Notes</div>
                <div>• Secured by a <strong>unique random token</strong> — unguessable without the URL.</div>
                <div>• Shows <strong>project names and scores only</strong> — judge aliases are never exposed.</div>
                <div>• <strong>Revoke anytime</strong> — the link stops working instantly.</div>
                <div>• Use <strong>expiry</strong> to auto-disable the link after the event ends.</div>
              </div>
            </>}

            {/* SCORE EXPORT */}
            {adminTab==="export" && <>
              <div className="adm-h1">Score Export</div>
              <div className="adm-sub">Extract every judge's scores for every project — download as CSV or save a backup to the database.</div>

              {/* Live export */}
              <div className="card">
                <div className="sec-title">Live Export</div>
                <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:"1rem"}}>
                  Download the current scores as a detailed CSV — one row per judge + project combination, with all 10 rubric criteria, totals, and judge notes.
                </p>
                <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",alignItems:"center"}}>
                  <button className="btn sec sm" style={{width:"auto"}} onClick={exportJudgeScoresCSV}
                    disabled={Object.keys(scores).length === 0}>
                    ⬇ Download Judge Scores CSV
                  </button>
                  {Object.keys(scores).length === 0 && (
                    <span style={{fontSize:".78rem",color:"var(--dim)"}}>No scores recorded yet.</span>
                  )}
                </div>
                <div style={{marginTop:".75rem",fontSize:".76rem",color:"var(--dim)"}}>
                  Columns: Judge · Project # · Title · Category · Grade · Presentation · Testable Q · Background · Hypothesis · Variables · Materials · Data · Analysis · Conclusion · Abstract · Total · Notes · Submitted
                </div>
              </div>

              {/* Save backup to DB */}
              <div className="card">
                <div className="sec-title">Save Backup to Database</div>
                <p style={{fontSize:".85rem",color:"var(--dim)",marginBottom:"1rem"}}>
                  Snapshot the current scores and store them permanently in Supabase. Saved backups are listed below and can be re-downloaded anytime.
                </p>
                <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",alignItems:"center"}}>
                  <button className="btn sm" style={{width:"auto",background:backupSaved?"var(--green)":undefined}}
                    onClick={saveScoreBackup} disabled={savingBackup || Object.keys(scores).length === 0}>
                    {savingBackup ? "⏳ Saving…" : backupSaved ? "✓ Saved!" : "💾 Save Score Backup"}
                  </button>
                  {Object.keys(scores).length === 0 && (
                    <span style={{fontSize:".78rem",color:"var(--dim)"}}>No scores to back up yet.</span>
                  )}
                </div>
              </div>

              {/* Saved backups list */}
              <div className="card">
                <div className="sec-title">Saved Backups</div>
                {scoreBackups.length === 0 ? (
                  <div style={{fontSize:".85rem",color:"var(--dim)",padding:".5rem 0"}}>No backups saved yet.</div>
                ) : (
                  <div className="tbl-wrap">
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:".84rem"}}>
                      <thead>
                        <tr style={{borderBottom:"2px solid var(--bd)"}}>
                          <th style={{textAlign:"left",padding:".5rem .75rem",color:"var(--dim)",fontFamily:"var(--ff-m)",fontSize:".73rem",fontWeight:500}}>SAVED AT</th>
                          <th style={{textAlign:"left",padding:".5rem .75rem",color:"var(--dim)",fontFamily:"var(--ff-m)",fontSize:".73rem",fontWeight:500}}>LABEL</th>
                          <th style={{textAlign:"right",padding:".5rem .75rem",color:"var(--dim)",fontFamily:"var(--ff-m)",fontSize:".73rem",fontWeight:500}}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scoreBackups.map((bk, i) => (
                          <tr key={bk.id} style={{borderBottom:"1px solid var(--bd)",background:i%2===0?"var(--s1)":"var(--bg)"}}>
                            <td style={{padding:".55rem .75rem",fontFamily:"var(--ff-m)",fontSize:".78rem",color:"var(--dim)",whiteSpace:"nowrap"}}>
                              {new Date(bk.created_at).toLocaleString()}
                            </td>
                            <td style={{padding:".55rem .75rem",fontSize:".84rem",color:"var(--text)"}}>{bk.label}</td>
                            <td style={{padding:".55rem .75rem",textAlign:"right"}}>
                              <button className="btn sec sm" style={{width:"auto",fontSize:".75rem"}}
                                onClick={() => {
                                  if (!bk.snapshot) {
                                    supabase.from("score_backups").select("snapshot").eq("id", bk.id).single()
                                      .then(({ data }) => data && downloadBackupCSV({ ...bk, snapshot: data.snapshot }));
                                  } else {
                                    downloadBackupCSV(bk);
                                  }
                                }}>
                                ⬇ CSV
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
                          if (val === IT_PIN) {
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
              return <div className="it-dark-wrap">
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:".75rem",marginBottom:".25rem"}}>
                  <div>
                    <div className="adm-h1" style={{color:"#e2e8f5"}}>IT Diagnostic Logs</div>
                    <div className="adm-sub" style={{marginBottom:0,color:"#6b7fa3"}}>Structured event log for debugging — copy & paste directly into AI for analysis.</div>
                  </div>
                  <div className="it-lock-badge" onClick={() => { setItUnlocked(false); setItPin(""); setItPinErr(""); addItLog("INFO","AUTH","IT_ACCESS_LOCKED","IT diagnostic logs manually locked",{ timestamp:fmtISO(Date.now()) }); }}>
                    🔒 Lock IT Logs
                  </div>
                </div>
                <div style={{marginBottom:"1.5rem"}} />
                {/* Quick stats */}
                <div className="stat-grid" style={{marginBottom:"1rem"}}>
                  <div className="stat-card" style={{background:"#0d1b30",border:"1px solid #1c2e4a"}}><div className="stat-v" style={{color:"#e2e8f5",fontSize:"1.5rem"}}>{itLogs.length}</div><div className="stat-l" style={{color:"#6b7fa3"}}>Total Events</div></div>
                  <div className="stat-card" style={{background:"#0d1b30",border:"1px solid #1c2e4a"}}><div className="stat-v" style={{color:"#ef4444",fontSize:"1.5rem"}}>{errCount}</div><div className="stat-l" style={{color:"#6b7fa3"}}>Errors</div></div>
                  <div className="stat-card" style={{background:"#0d1b30",border:"1px solid #1c2e4a"}}><div className="stat-v" style={{color:"#f59e0b",fontSize:"1.5rem"}}>{warnCount}</div><div className="stat-l" style={{color:"#6b7fa3"}}>Warnings</div></div>
                  <div className="stat-card" style={{background:"#0d1b30",border:"1px solid #1c2e4a"}}><div className="stat-v" style={{color:"#22c55e",fontSize:"1.5rem"}}>{itLogs.filter(e=>e.level==="INFO").length}</div><div className="stat-l" style={{color:"#6b7fa3"}}>Info</div></div>
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
                <div style={{marginTop:"1.25rem",background:"#0d1b30",border:"1px solid #1c2e4a",borderRadius:"var(--r)",padding:"1.5rem"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".75rem",flexWrap:"wrap",gap:".5rem"}}>
                    <div>
                      <div style={{fontFamily:"var(--ff-d)",fontSize:"1rem",marginBottom:".15rem",color:"#e2e8f5"}}>📸 System Snapshot</div>
                      <div style={{fontSize:".82rem",color:"#6b7fa3"}}>Current live state — paste into AI to diagnose issues</div>
                    </div>
                    <button className={`copy-report-btn ${snapCopied?"done":""}`} onClick={handleCopySnapshot}>
                      {snapCopied ? "✓ Copied!" : "📋 Copy Snapshot"}
                    </button>
                  </div>
                  <div className="snap-box">{buildSnapshot()}</div>
                </div>

                {/* How to use */}
                <div style={{marginTop:"1rem",background:"#0d1b30",border:"1px solid #1c2e4a",borderRadius:"var(--r)",padding:"1.5rem"}}>
                  <div style={{fontFamily:"var(--ff-d)",fontSize:"1rem",marginBottom:".75rem",color:"#e2e8f5"}}>💡 How to use with AI</div>
                  <div style={{fontSize:".88rem",color:"#6b7fa3",lineHeight:"1.8"}}>
                    <div>1. Filter by <strong style={{color:"#e2e8f5"}}>ERROR</strong> or <strong style={{color:"#e2e8f5"}}>WARN</strong> to isolate the issue.</div>
                    <div>2. Click <strong style={{color:"#e2e8f5"}}>Copy Full Report</strong> — it includes the system state + all log entries.</div>
                    <div>3. Paste into Claude or any AI with: <em style={{color:"#60a5fa"}}>"Here is my science fair app diagnostic report. What is causing the issue and how do I fix it?"</em></div>
                    <div>4. For live state issues, use <strong style={{color:"#e2e8f5"}}>Copy Snapshot</strong> to share the current data state.</div>
                  </div>
                </div>

                {/* Clear button */}
                <button className="btn danger sm" style={{width:"auto",marginTop:"1rem"}}
                  onClick={() => { setItLogs([]); addItLog("INFO","ADMIN","LOGS_CLEARED","IT logs cleared by admin",{ clearedAt:fmtISO(Date.now()), count: itLogs.length }); }}>
                  🗑 Clear All IT Logs
                </button>
              </div>;
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
    const podCols  = ["var(--amber)","#64748b","#b45309"];

    return (
      <div className="app"><style>{CSS}</style>{backdrop}
        <div className="glow purple" />
        <div className="pub-wrap">
          <div className="pub-inner">

            {/* Hero */}
            <div className="pub-hero">
              <div style={{fontSize:"3.5rem",marginBottom:".5rem"}}>🏆</div>
              <h1>{shareTitle || "Science Fair SY 2025-2026 — Final Results"}</h1>
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
                      {finalDecisions[p.id]?.finalized && finalDecisions[p.id]?.award !== "No Award" && finalDecisions[p.id]?.award !== "Pending" && (
                        <div style={{marginTop:".35rem"}}>
                          <span className={`award-badge sm ${awardBadgeClass(finalDecisions[p.id].award)}`}>
                            {awardEmoji(finalDecisions[p.id].award)} {finalDecisions[p.id].award}
                          </span>
                        </div>
                      )}
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
                    <div className="res-title">
                      {p.title}
                      {finalDecisions[p.id]?.finalized && finalDecisions[p.id]?.award !== "No Award" && finalDecisions[p.id]?.award !== "Pending" && (
                        <span className={`award-badge sm ${awardBadgeClass(finalDecisions[p.id].award)}`} style={{marginLeft:".5rem",verticalAlign:"middle"}}>
                          {awardEmoji(finalDecisions[p.id].award)} {finalDecisions[p.id].award}
                        </span>
                      )}
                    </div>
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
              <strong>{shareTitle || "Science Fair SY 2025-2026"}</strong><br />
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
