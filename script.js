// ============================================================
// Total Battle Stacking Calculator - v4.0
// ============================================================
// Resource pools:
//   Leadership  → Guardsmen, Specialists, Engineering Corps
//   Dominance   → Player Monsters (M1-M9)
//   Authority   → Mercenaries (all classes)
// All three independent caps on the same march.
//
// v4 additions:
//   - Combat type filtering (Ranged/Melee/Mounted/Flying)
//   - Master auto-exclude toggle for enemy bonus types
//   - localStorage persistence for mined data
//   - In-app data entry modal (mercs, monsters, enemy squads)
//   - JSON export for GitHub commit
// ============================================================

const TIER_MULTIPLIER = 1.9;
const COMBAT_TYPES    = [“Ranged”, “Melee”, “Mounted”, “Flying”];
const SUBTYPES        = [“Human”, “Beast”, “Dragon”, “Elemental”, “Giant”, “Guardsman”, “Epic Monster Hunter”];
const LS_KEYS = {
mercs:    “tb_mercs_v4”,
monsters: “tb_monsters_v4”,
enemies:  “tb_enemies_v4”
};

// ============================================================
// DATA STORE
// ============================================================
let DB = {
leadership: null,
dominance:  null,
authority:  null,
enemy:      null,
local: { mercs: [], monsters: [], enemies: [] }
};

// ============================================================
// LOAD & MERGE DATA
// ============================================================
async function loadData() {
DB.local.mercs    = lsGet(LS_KEYS.mercs)    || [];
DB.local.monsters = lsGet(LS_KEYS.monsters) || [];
DB.local.enemies  = lsGet(LS_KEYS.enemies)  || [];

try {
const [l, d, a, e] = await Promise.all([
fetch(“data/troops_leadership.json”).then(r => r.json()),
fetch(“data/troops_dominance.json”).then(r => r.json()),
fetch(“data/troops_authority.json”).then(r => r.json()),
fetch(“data/enemy_squads.json”).then(r => r.json())
]);
DB.leadership = l;
DB.dominance  = d;
DB.authority  = a;
DB.enemy      = e;
updateDbStatus(true);
} catch (err) {
console.warn(“Base JSON files not found.”, err);
DB.enemy = { squads: { common:[], rare:[], heroic:[], citadels:[], epics:[], other:[] } };
updateDbStatus(false);
}
populateEnemyDropdowns();
}

function updateDbStatus(ok) {
const el = document.getElementById(“dbStatus”);
if (!el) return;
const n = DB.local.mercs.length + DB.local.monsters.length + DB.local.enemies.length;
el.textContent = ok
? `✅ Base data loaded. ${n} locally-added record(s).`
: `⚠️ Base JSON missing. ${n} locally-added record(s).`;
el.style.color = ok ? “#4caf50” : “#e8a838”;
}

// ============================================================
// LOCALSTORAGE HELPERS
// ============================================================
function lsGet(key) {
try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function lsSet(key, val) {
try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.warn(e); }
}

// ============================================================
// ENEMY SQUAD HELPERS
// ============================================================
function getAllSquads() {
const base = DB.enemy?.squads || {};
const baseSquads = [
…(base.common||[]), …(base.rare||[]), …(base.heroic||[]),
…(base.citadels||[]), …(base.epics||[]), …(base.other||[])
].filter(s => s.squad_level > 0);
const baseIds = new Set(baseSquads.map(s => s.squad_id));
return […baseSquads, …DB.local.enemies.filter(s => !baseIds.has(s.squad_id))];
}

function findSquad(id) {
return getAllSquads().find(s => s.squad_id === id) || null;
}

function populateEnemyDropdowns() {
const catSel   = document.getElementById(“enemyCategory”);
const squadSel = document.getElementById(“enemySquad”);
if (!catSel || !squadSel) return;

const cats = [“all”,“common”,“rare”,“heroic”,“citadel_elven”,“citadel_cursed”,“epic”,“other”];
catSel.innerHTML = cats.map(c =>
`<option value="${c}">${c==="all"?"All Categories":formatLabel(c)}</option>`
).join(””);
filterSquadDropdown();
}

function filterSquadDropdown() {
const cat = document.getElementById(“enemyCategory”)?.value || “all”;
const sel = document.getElementById(“enemySquad”);
if (!sel) return;
sel.innerHTML = ‘<option value="">– None / Skip –</option>’;
getAllSquads()
.filter(s => cat===“all” || s.category===cat)
.forEach(s => {
const o = document.createElement(“option”);
o.value = s.squad_id;
o.textContent = `${s.squad_name} (Lvl ${s.squad_level}) — ${formatLabel(s.faction)}`;
sel.appendChild(o);
});
onSquadSelected();
}

function onSquadSelected() {
const squad = findSquad(document.getElementById(“enemySquad”)?.value || “”);
const eng   = document.getElementById(“engineeringNote”);
const hint  = document.getElementById(“leaderHint”);
if (eng)  eng.style.display  = squad?.engineering_recommended ? “block” : “none”;
if (hint) {
if (squad) {
const rules = DB.enemy?.allowed_leaders_key || {};
hint.textContent = `ℹ️ ${rules[squad.allowed_leaders] || formatLabel(squad.allowed_leaders)}`;
hint.style.display = “block”;
} else {
hint.style.display = “none”;
}
}
buildExcludeToggle(squad);
}

// ============================================================
// ENEMY ANALYSIS & AUTO-EXCLUDE
// ============================================================
function analyzeEnemy(squad) {
if (!squad?.units?.length) return null;
let typeBonus = { Ranged:0, Melee:0, Mounted:0, Flying:0 };
let subtypeBonus = {};
squad.units.forEach(u => {
(u.bonuses||[]).forEach(b => {
if (b.target_type && typeBonus[b.target_type] !== undefined)
typeBonus[b.target_type] += b.value;
if (b.target_subtype)
subtypeBonus[b.target_subtype] = (subtypeBonus[b.target_subtype]||0) + b.value;
});
});
const warnings = [
…Object.entries(typeBonus).filter(([,v])=>v>0).map(([t,v])=>({
target:t, kind:“type”, value:v,
severity: v>=50?“HIGH”:“MODERATE”,
message:`[${v>=50?"HIGH":"MOD"}] Enemy +${v}% vs ${t.toUpperCase()} troops`
})),
…Object.entries(subtypeBonus).filter(([,v])=>v>0).map(([s,v])=>({
target:s, kind:“subtype”, value:v,
severity: v>=50?“HIGH”:“MODERATE”,
message:`[${v>=50?"HIGH":"MOD"}] Enemy +${v}% vs ${s} units specifically`
}))
];
return { typeBonus, subtypeBonus, warnings, totalUnits: squad.units.reduce((s,u)=>s+(u.count||0),0) };
}

function buildExcludeToggle(squad) {
const section = document.getElementById(“excludeSection”);
if (!section) return;
const analysis = analyzeEnemy(squad);
if (!analysis?.warnings.length) { section.innerHTML=””; section.style.display=“none”; return; }

const affTypes    = Object.entries(analysis.typeBonus).filter(([,v])=>v>0).map(([t])=>t);
const affSubtypes = Object.keys(analysis.subtypeBonus).filter(k=>analysis.subtypeBonus[k]>0);

section.innerHTML = ` <div class="exclude-box"> <div class="exclude-title">⚠️ Enemy Bonus Warnings</div> ${analysis.warnings.map(w=>`<div class="warning-line ${w.severity.toLowerCase()}">${w.message}</div>`).join("")} <label class="exclude-toggle"> <input type="checkbox" id="autoExclude" onchange="updateExcludeDisplay()"> <span>Auto-exclude all affected types from my stack</span> </label> <div id="excludePreview" class="exclude-preview" style="display:none"> Will remove from ALL pools: <strong>${[...affTypes,...affSubtypes].join(", ")}</strong> </div> </div>`;
section.style.display = “block”;
}

function updateExcludeDisplay() {
const cb = document.getElementById(“autoExclude”);
const pr = document.getElementById(“excludePreview”);
if (pr) pr.style.display = cb?.checked ? “block” : “none”;
}

function getExcludedTypes() {
const cb = document.getElementById(“autoExclude”);
if (!cb?.checked) return { types: new Set(), subtypes: new Set() };
const squad    = findSquad(document.getElementById(“enemySquad”)?.value||””);
const analysis = analyzeEnemy(squad);
if (!analysis) return { types: new Set(), subtypes: new Set() };
return {
types:    new Set(Object.entries(analysis.typeBonus).filter(([,v])=>v>0).map(([t])=>t)),
subtypes: new Set(Object.keys(analysis.subtypeBonus).filter(k=>analysis.subtypeBonus[k]>0))
};
}

function isExcluded(excl, combat_type, subtype) {
return excl.types.has(combat_type) || excl.subtypes.has(subtype);
}

// ============================================================
// TIER HELPERS
// ============================================================
function getCheckedTiers(name) {
return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
.map(b => parseInt(b.value)).sort((a,b) => b-a);
}

// ============================================================
// CORE STACKING MATH
// ============================================================
function splitTroops(total, tierList, prefix) {
if (!total||total<=0||!tierList?.length) return {};
const maxTier = tierList[0];
let tiers=[], ratioSum=0;
tierList.forEach(t => {
const r = Math.pow(TIER_MULTIPLIER, maxTier-t);
tiers.push({tier:t, ratio:r});
ratioSum += r;
});
let results={}, remaining=total;
tiers.forEach(t => {
const c = Math.floor((total*t.ratio)/ratioSum);
results[prefix+t.tier] = c;
remaining -= c;
});
results[prefix+maxTier] += remaining;
return results;
}

function tierLines(obj) {
return Object.entries(obj).filter(([,v])=>v>0)
.map(([k,v])=>`    ${k}: ${v.toLocaleString()}`).join(”\n”)+”\n”;
}

// ============================================================
// ALLOCATION HELPER — splits a leadership budget across
// up to 3 unit types using 2-2-1 leadership ratio:
//   rw=2 → ranged gets 2 parts of leadership, 1 leadership/unit
//   mw=2 → melee  gets 2 parts of leadership, 1 leadership/unit
//   cw=1 → mounted gets 1 part of leadership, 2 leadership/unit
//           so mounted HEADCOUNT = leadership_share / 2
//
// Example: budget=1000, all types enabled (rw=2,mw=2,cw=1)
//   totalW = 2+2+1 = 5
//   ranged  leadership = 1000*2/5 = 400 → 400 headcount
//   melee   leadership = 1000*2/5 = 400 → 400 headcount
//   mounted leadership = 1000*1/5 = 200 → 100 headcount (×2 cost)
// ============================================================
function allocate3(budget, rw, mw, cw) {
// rw, mw, cw are leadership-share weights (not headcount weights)
// mounted costs 2 leadership per unit so headcount = leadership_share / 2
const totalW = rw + mw + cw;
if (totalW <= 0) return { rangedN:0, meleeN:0, mountedN:0, rangedL:0, meleeL:0, mountedL:0 };

const rangedL  = Math.floor(budget * rw / totalW);
const meleeL   = Math.floor(budget * mw / totalW);
// Give any rounding remainder to ranged (or melee if ranged excluded)
const mountedL = budget - rangedL - meleeL;

return {
rangedN:  rangedL,           // 1 leadership per unit
meleeN:   meleeL,            // 1 leadership per unit
mountedN: Math.floor(mountedL / 2), // 2 leadership per unit
rangedL, meleeL, mountedL    // leadership consumed per type
};
}

// ============================================================
// MAIN CALCULATE
// ============================================================
function calculate() {
const leadership = parseInt(document.getElementById(“leadershipCap”).value)||0;
const dominance  = parseInt(document.getElementById(“dominanceCap”).value) ||0;
const authority  = parseInt(document.getElementById(“authorityCap”).value) ||0;

if (!leadership && !dominance && !authority) {
alert(“Enter at least one resource cap.”); return;
}

const tiersG    = getCheckedTiers(“tierG”);
const tiersS    = getCheckedTiers(“tierS”);
const tiersE    = getCheckedTiers(“tierE”);
const tiersM    = getCheckedTiers(“tierM”);
const tiersMerc = getCheckedTiers(“tierMerc”);

const squadId  = document.getElementById(“enemySquad”)?.value||””;
const squad    = findSquad(squadId);
const analysis = analyzeEnemy(squad);
const excl     = getExcludedTypes();

let out = “”;
out += `╔══════════════════════════════════════════╗\n`;
out += `   TOTAL BATTLE STACK CALCULATOR  v4.0\n`;
out += `╚══════════════════════════════════════════╝\n\n`;
out += `Tier Multiplier: ${TIER_MULTIPLIER}x\n`;
if (tiersG.length)    out += `Guardsmen      : ${tiersG.map(t=>"G"+t).join(", ")}\n`;
if (tiersS.length)    out += `Specialists    : ${tiersS.map(t=>"S"+t).join(", ")}\n`;
if (tiersE.length)    out += `Engineering    : ${tiersE.map(t=>"E"+t).join(", ")}\n`;
if (tiersM.length)    out += `Player Monsters: ${tiersM.map(t=>"M"+t).join(", ")}\n`;
if (tiersMerc.length) out += `Mercenaries    : ${tiersMerc.map(t=>"T"+t).join(", ")}\n`;

// Enemy info
if (squad) {
out += `\n━━━ ENEMY SQUAD ━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
out += `${squad.squad_name} — Level ${squad.squad_level}\n`;
out += `Category: ${formatLabel(squad.category)}   Faction: ${formatLabel(squad.faction)}\n`;
if (analysis?.totalUnits > 0) {
out += `Total enemy units: ${analysis.totalUnits.toLocaleString()}\n`;
squad.units.forEach(u => {
const bonusTxt = (u.bonuses||[]).map(b=>
b.target_type ? `+${b.value}% vs ${b.target_type}` : `+${b.value}% vs ${b.target_subtype}`
).filter(Boolean).join(”, “);
out += `  • ${(u.count||"?").toLocaleString()} ${u.unit_name}`;
out += ` [${u.combat_type||u.unit_class||"?"}${u.subtype?", "+u.subtype:""}]`;
if (bonusTxt) out += ` ← ${bonusTxt}`;
out += “\n”;
});
}
}

// Warnings & exclusions
if (analysis?.warnings.length > 0) {
out += `\n━━━ ⚠️  WARNINGS ━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
analysis.warnings.forEach(w => out += `${w.message}\n`);
if (excl.types.size>0||excl.subtypes.size>0) {
out += `🚫 AUTO-EXCLUDED: ${[...excl.types,...excl.subtypes].join(", ")}\n`;
}
}

// ── LEADERSHIP ───────────────────────────────────────────
if (leadership > 0) {
out += `\n━━━ LEADERSHIP POOL: ${leadership.toLocaleString()} ━━━━━━━━━━━━━━━━━━\n`;

```
const isCitadel = squad && (squad.category==="citadel_elven"||squad.category==="citadel_cursed"||squad.category==="pvp");
const showEng   = isCitadel && tiersE.length > 0;
const engRes    = showEng ? Math.floor(leadership*0.15) : 0;
const combatL   = leadership - engRes;

const hasG = tiersG.length > 0;
const hasS = tiersS.length > 0;
const gL   = Math.floor(combatL * (hasG&&hasS ? 0.5 : hasG ? 1 : 0));
const sL   = Math.floor(combatL * (hasG&&hasS ? 0.5 : hasS ? 1 : 0));

// GUARDSMEN
if (hasG && gL > 0) {
  // 2-2-1: ranged=2 parts, melee=2 parts, mounted=1 part of leadership
  const rw = isExcluded(excl,"Ranged","Human")  ? 0 : 2;
  const mw = isExcluded(excl,"Melee","Human")   ? 0 : 2;
  const cw = isExcluded(excl,"Mounted","Human") ? 0 : 1;
  const fw = isExcluded(excl,"Flying","Beast")  ? 0 : 1;
  const totalW = rw + mw + cw;

  out += `\n--- Guardsmen (${gL.toLocaleString()} leadership) ---\n`;
  if (totalW <= 0) {
    out += `  ALL types excluded by enemy bonuses.\n`;
  } else {
    const { rangedN, meleeN, mountedN, rangedL, meleeL, mountedL } = allocate3(gL, rw, mw, cw);
    if (rangedN > 0) {
      out += `🏹 Archers [Ranged, Human] — ${rangedN.toLocaleString()} (${rangedL.toLocaleString()} leadership)\n`;
      out += tierLines(splitTroops(rangedN, tiersG, "G"));
    }
    if (meleeN > 0) {
      out += `🗡️  Spearmen [Melee, Human] — ${meleeN.toLocaleString()} (${meleeL.toLocaleString()} leadership)\n`;
      out += tierLines(splitTroops(meleeN, tiersG, "G"));
    }
    if (mountedN > 0) {
      out += `🐎 Riders [Mounted, Human] — ${mountedN.toLocaleString()} headcount (${mountedL.toLocaleString()} leadership, ×2 cost)\n`;
      out += tierLines(splitTroops(mountedN, tiersG, "G"));
    }
    const flyTiers = tiersG.filter(t=>t>=5);
    if (fw > 0 && flyTiers.length > 0) {
      out += `🦅 Griffins/Corax [Flying, Beast] available G5+ — allocate from Ranged budget.\n`;
    }
  }
}

// SPECIALISTS
if (hasS && sL > 0) {
  // 2-2-1: ranged=2 parts, melee=2 parts, mounted=1 part of leadership
  const rw = isExcluded(excl,"Ranged","Human")  ? 0 : 2;
  const mw = isExcluded(excl,"Melee","Human")   ? 0 : 2;
  const cw = isExcluded(excl,"Mounted","Human") ? 0 : 1;
  const totalW = rw + mw + cw;

  out += `\n--- Specialists (${sL.toLocaleString()} leadership) ---\n`;
  if (totalW <= 0) {
    out += `  ALL types excluded by enemy bonuses.\n`;
  } else {
    const { rangedN, meleeN, mountedN, rangedL, meleeL, mountedL } = allocate3(sL, rw, mw, cw);
    if (rangedN > 0) {
      out += `🏹 Vultures/Deadshot [Ranged, Human] — ${rangedN.toLocaleString()} (${rangedL.toLocaleString()} leadership)\n`;
      out += tierLines(splitTroops(rangedN, tiersS, "S"));
    }
    if (meleeN > 0) {
      out += `🗡️  Swordsmen [Melee, Human] — ${meleeN.toLocaleString()} (${meleeL.toLocaleString()} leadership)\n`;
      out += tierLines(splitTroops(meleeN, tiersS, "S"));
    }
    if (mountedN > 0) {
      out += `🐎 Lion Riders [Mounted, Human] — ${mountedN.toLocaleString()} headcount (${mountedL.toLocaleString()} leadership, ×2 cost)\n`;
      out += tierLines(splitTroops(mountedN, tiersS, "S"));
    }
    if (!isExcluded(excl,"Flying","Human") && tiersS.some(t=>t>=8)) {
      out += `🦅 Royal Lions [Flying, Human] available S8+ — allocate from Ranged budget.\n`;
    }
  }
}

// ENGINEERING
if (showEng && engRes > 0) {
  out += `\n--- Engineering Corps (${engRes.toLocaleString()} leadership — 15% reserve) ---\n`;
  out += `⚙️  Siege Engines [Siege, Human]\n`;
  out += tierLines(splitTroops(engRes, tiersE, "E"));
}

out += `\nLeadership consumed: ${leadership.toLocaleString()} / ${leadership.toLocaleString()}\n`;
```

}

// ── DOMINANCE ────────────────────────────────────────────
if (dominance > 0 && tiersM.length > 0) {
out += `\n━━━ DOMINANCE POOL: ${dominance.toLocaleString()} ━━━━━━━━━━━━━━━━━━━━\n`;
const avail = DB.local.monsters.filter(m => !isExcluded(excl, m.combat_type, m.subtype));
if (avail.length > 0) {
out += `Available monsters (after exclusions):\n`;
avail.forEach(m => out += `  ${m.name} [${m.combat_type}, ${m.subtype}] T${m.tier||"?"} STR:${m.strength||"?"} HP:${m.health||"?"} Cost:${m.resource_cost||"?"}\n`);
out += `\n`;
} else {
out += `(Add monsters via ⚙️ Manage Data)\n`;
}
out += `🐲 PLAYER MONSTERS (tier split)\n`;
out += tierLines(splitTroops(dominance, tiersM, “M”));
out += `Dominance consumed: ${dominance.toLocaleString()} / ${dominance.toLocaleString()}\n`;
}

// ── AUTHORITY ────────────────────────────────────────────
if (authority > 0 && tiersMerc.length > 0) {
out += `\n━━━ AUTHORITY POOL: ${authority.toLocaleString()} ━━━━━━━━━━━━━━━━━━━━\n`;
const avail = DB.local.mercs.filter(m => !isExcluded(excl, m.combat_type, m.subtype));
if (avail.length > 0) {
out += `Available mercenaries (after exclusions):\n`;
avail.forEach(m => out += `  ${m.name} [${m.combat_type}, ${m.subtype}] T${m.tier||"?"} STR:${m.strength||"?"} HP:${m.health||"?"} Cost:${m.resource_cost||"?"}\n`);
out += `\n`;
} else {
out += `(Add mercs via ⚙️ Manage Data)\n`;
}
out += `⚔️  MERCENARIES (tier split)\n`;
const res = splitTroops(authority, tiersMerc, “T”);
Object.entries(res).forEach(([k,v])=>{ if(v>0) out+=`    Tier ~${k.replace("T","")}: ${v.toLocaleString()}\n`; });
out += `Authority consumed: ${authority.toLocaleString()} / ${authority.toLocaleString()}\n`;
}

document.getElementById(“output”).textContent = out;
}

// ============================================================
// DATA MODAL
// ============================================================
let modalTab = “mercs”;

function openDataModal() {
document.getElementById(“dataModal”).style.display = “flex”;
switchModalTab(modalTab);
}

function closeDataModal() {
document.getElementById(“dataModal”).style.display = “none”;
}

function switchModalTab(tab) {
modalTab = tab;
[“mercs”,“monsters”,“enemies”].forEach(t => {
document.getElementById(`tab-${t}`)?.classList.toggle(“active”, t===tab);
});
renderModalContent();
}

function renderModalContent() {
const c = document.getElementById(“modalContent”);
if (!c) return;
if (modalTab===“mercs”)    renderMercsTab(c);
if (modalTab===“monsters”) renderMonstersTab(c);
if (modalTab===“enemies”)  renderEnemiesTab(c);
}

// –– MERCS TAB ––
function renderMercsTab(c) {
c.innerHTML = `<div class="modal-section"> <h3>Mercenaries <span class="count-badge">${DB.local.mercs.length}</span></h3> <p class="hint">Add each mercenary from the Mercenary Exchange. Examples: Arbalaster VII (Ranged, Guardsman), Golden Dragon VII (Flying, Dragon), Jungle King (Melee, Beast).</p> ${buildUnitForm("merc")} ${DB.local.mercs.length > 0 ? `<div class="unit-list">${DB.local.mercs.map((m,i)=>` <div class="unit-row"> <span class="unit-name">${m.name}</span> <span class="unit-tags">${m.combat_type} · ${m.subtype} · T${m.tier||"?"}</span> <span class="unit-stats">STR:${m.strength||"?"} HP:${m.health||"?"} Cost:${m.resource_cost||"?"}</span> <button class="btn-delete" onclick="deleteUnit('mercs',${i})">✕</button> </div>`).join(””)}</div>`:`<p class="hint empty-hint">No mercenaries added yet.</p>`}
<button class="btn-export" onclick="exportJSON('mercs')">⬇️ Export mercs JSON</button>

  </div>`;
}

// –– MONSTERS TAB ––
function renderMonstersTab(c) {
c.innerHTML = `<div class="modal-section"> <h3>Player Monsters <span class="count-badge">${DB.local.monsters.length}</span></h3> <p class="hint">Add your owned monsters from Barracks > Monsters.</p> ${buildUnitForm("monster")} ${DB.local.monsters.length > 0 ? `<div class="unit-list">${DB.local.monsters.map((m,i)=>` <div class="unit-row"> <span class="unit-name">${m.name}</span> <span class="unit-tags">${m.combat_type} · ${m.subtype} · T${m.tier||"?"}</span> <span class="unit-stats">STR:${m.strength||"?"} HP:${m.health||"?"} Cost:${m.resource_cost||"?"}</span> <button class="btn-delete" onclick="deleteUnit('monsters',${i})">✕</button> </div>`).join(””)}</div>`:`<p class="hint empty-hint">No player monsters added yet.</p>`}
<button class="btn-export" onclick="exportJSON('monsters')">⬇️ Export monsters JSON</button>

  </div>`;
}

// –– ENEMIES TAB ––
function renderEnemiesTab(c) {
const cats    = [“common”,“rare”,“heroic”,“citadel_elven”,“citadel_cursed”,“epic”,“other”];
const facs    = [“barbarian”,“inferno”,“undead”,“elf”,“cursed”,“other”];
const allowedMap = {
rare:“hero_only”, common:“captain_only”, heroic:“hero_plus_3_max”,
citadel_elven:“hero_plus_3_max”, citadel_cursed:“hero_plus_3_max”,
epic:“captain_1_max”, other:“captain_only”
};

let html = `<div class="modal-section"> <h3>Enemy Squads <span class="count-badge">${DB.local.enemies.length}</span></h3> <p class="hint">Add squads you encounter. Bonus format: TypeName:value e.g. <code>Melee:35,Mounted:20</code></p> <div class="form-group-row"> <input id="ns-name"    placeholder="Squad name" class="form-input" /> <input id="ns-level"   type="number" placeholder="Level" class="form-input short" /> <select id="ns-cat" class="form-input">${cats.map(c=>`<option value="${c}">${formatLabel(c)}</option>`).join("")}</select> <select id="ns-fac" class="form-input">${facs.map(f=>`<option value="${f}">${formatLabel(f)}</option>`).join("")}</select> <button class="btn-add" onclick="addEnemySquad()">+ Add Squad</button> </div>`;

DB.local.enemies.forEach((sq, si) => {
html += `<div class="squad-block"> <div class="squad-header"> <span>${sq.squad_name} (Lvl ${sq.squad_level}) — ${formatLabel(sq.faction)} [${formatLabel(sq.category)}]</span> <button class="btn-delete" onclick="deleteEnemySquad(${si})">✕ Remove</button> </div>`;
(sq.units||[]).forEach((u,ui)=>{
const bt = (u.bonuses||[]).map(b=>b.target_type?`+${b.value}% vs ${b.target_type}`:`+${b.value}% vs ${b.target_subtype}`).join(”, “);
html += `<div class="unit-row sub"> <span class="unit-name">${u.unit_name} ×${u.count||"?"}</span> <span class="unit-tags">${u.combat_type||""} · ${u.subtype||""}</span> <span class="unit-stats">${bt||"no bonuses"}</span> <button class="btn-delete" onclick="deleteEnemyUnit(${si},${ui})">✕</button> </div>`;
});
html += `<div class="form-group-row sub-form"> <input id="eu-name-${si}"  placeholder="Unit name" class="form-input" /> <input id="eu-count-${si}" type="number" placeholder="Count" class="form-input short" /> <select id="eu-type-${si}" class="form-input short">${COMBAT_TYPES.map(t=>`<option>${t}</option>`).join("")}</select> <select id="eu-sub-${si}"  class="form-input short">${SUBTYPES.map(s=>`<option>${s}</option>`).join("")}</select> <input id="eu-btype-${si}" placeholder="Type bonuses e.g. Melee:35,Mounted:20" class="form-input" /> <input id="eu-bsub-${si}"  placeholder="Subtype bonuses e.g. Dragon:50" class="form-input" /> <button class="btn-add small" onclick="addEnemyUnit(${si})">+ Unit</button> </div></div>`;
});

html += `<button class="btn-export" onclick="exportJSON('enemies')">⬇️ Export enemy squads JSON</button>

  </div>`;
  c.innerHTML = html;
}

function buildUnitForm(type) {
const id = `new-${type}`;
return `<div class="form-group-row"> <input id="${id}-name"  placeholder="Unit name" class="form-input" /> <select id="${id}-type" class="form-input short">${COMBAT_TYPES.map(t=>`<option>${t}</option>`).join("")}</select> <select id="${id}-sub"  class="form-input short">${SUBTYPES.map(s=>`<option>${s}</option>`).join(””)}</select>
<input id="${id}-tier"  type="number" placeholder="Tier" class="form-input short" min="1" max="9"/>
<input id="${id}-str"   type="number" placeholder="Strength" class="form-input short" />
<input id="${id}-hp"    type="number" placeholder="Health" class="form-input short" />
<input id="${id}-cost"  type="number" placeholder="Resource cost" class="form-input short" />
<button class="btn-add" onclick="addUnit('${type}s')">+ Add</button>

  </div>`;
}

function addUnit(pool) {
const type = pool===“mercs” ? “merc” : “monster”;
const pfx  = `new-${type}`;
const name = document.getElementById(`${pfx}-name`)?.value?.trim();
if (!name) { alert(“Enter a unit name.”); return; }
DB.local[pool].push({
name,
combat_type:   document.getElementById(`${pfx}-type`)?.value,
subtype:       document.getElementById(`${pfx}-sub`)?.value,
tier:          parseInt(document.getElementById(`${pfx}-tier`)?.value)||null,
strength:      parseInt(document.getElementById(`${pfx}-str`)?.value) ||null,
health:        parseInt(document.getElementById(`${pfx}-hp`)?.value)  ||null,
resource_cost: parseInt(document.getElementById(`${pfx}-cost`)?.value)||null,
bonuses: []
});
lsSet(LS_KEYS[pool], DB.local[pool]);
updateDbStatus(true);
renderModalContent();
}

function deleteUnit(pool, i) {
DB.local[pool].splice(i,1);
lsSet(LS_KEYS[pool], DB.local[pool]);
updateDbStatus(true);
renderModalContent();
}

function addEnemySquad() {
const name  = document.getElementById(“ns-name”)?.value?.trim();
const level = parseInt(document.getElementById(“ns-level”)?.value)||0;
const cat   = document.getElementById(“ns-cat”)?.value;
const fac   = document.getElementById(“ns-fac”)?.value;
if (!name) { alert(“Enter a squad name.”); return; }
const allowedMap = { rare:“hero_only”, common:“captain_only”, heroic:“hero_plus_3_max”,
citadel_elven:“hero_plus_3_max”, citadel_cursed:“hero_plus_3_max”, epic:“captain_1_max”, other:“captain_only” };
DB.local.enemies.push({
squad_id:`local_${cat}_${fac}_L${level}_${Date.now()}`,
squad_name:name, squad_level:level, category:cat, faction:fac,
allowed_leaders: allowedMap[cat]||“captain_only”,
engineering_recommended: cat===“citadel_elven”||cat===“citadel_cursed”,
units:[]
});
lsSet(LS_KEYS.enemies, DB.local.enemies);
filterSquadDropdown();
renderModalContent();
}

function deleteEnemySquad(i) {
DB.local.enemies.splice(i,1);
lsSet(LS_KEYS.enemies, DB.local.enemies);
filterSquadDropdown();
renderModalContent();
}

function addEnemyUnit(si) {
const name  = document.getElementById(`eu-name-${si}`)?.value?.trim();
const count = parseInt(document.getElementById(`eu-count-${si}`)?.value)||0;
const ctype = document.getElementById(`eu-type-${si}`)?.value;
const sub   = document.getElementById(`eu-sub-${si}`)?.value;
const btRaw = document.getElementById(`eu-btype-${si}`)?.value?.trim();
const bsRaw = document.getElementById(`eu-bsub-${si}`)?.value?.trim();
if (!name) { alert(“Enter a unit name.”); return; }

const bonuses = [];
if (btRaw) btRaw.split(”,”).forEach(p => {
const [t,v] = p.split(”:”).map(s=>s.trim());
if (t&&v) bonuses.push({ target_type:t, value:parseInt(v) });
});
if (bsRaw) bsRaw.split(”,”).forEach(p => {
const [s,v] = p.split(”:”).map(x=>x.trim());
if (s&&v) bonuses.push({ target_subtype:s, value:parseInt(v) });
});

DB.local.enemies[si].units.push({
unit_id:`lu_${Date.now()}`, unit_name:name, count,
combat_type:ctype, subtype:sub,
strength:null, health:null, leadership:1, initiative:null, bonuses
});
lsSet(LS_KEYS.enemies, DB.local.enemies);
filterSquadDropdown();
renderModalContent();
}

function deleteEnemyUnit(si, ui) {
DB.local.enemies[si].units.splice(ui,1);
lsSet(LS_KEYS.enemies, DB.local.enemies);
renderModalContent();
}

function exportJSON(pool) {
const data = pool===“enemies”
? { version:“4.0”, squads: DB.local.enemies }
: { version:“4.0”, units:  DB.local[pool]  };
const a = document.createElement(“a”);
a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:“application/json”}));
a.download = `tb_local_${pool}.json`;
a.click();
}

// ============================================================
// UTILITY & INIT
// ============================================================
function formatLabel(str) {
return str ? str.replace(/_/g,” “).replace(/\b\w/g,c=>c.toUpperCase()) : “”;
}

window.addEventListener(“DOMContentLoaded”, loadData);