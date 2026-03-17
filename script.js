// ============================================================
// Total Battle Stacking Calculator - v4.1
// Safari/iOS compatible — no optional chaining (?.)
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
// SAFE HELPERS — no optional chaining for Safari compat
// ============================================================
function safeVal(id) {
var el = document.getElementById(id);
return el ? el.value : “”;
}
function safeSet(id, val) {
var el = document.getElementById(id);
if (el) el.innerHTML = val;
}
function safeStyle(id, prop, val) {
var el = document.getElementById(id);
if (el) el.style[prop] = val;
}
function safeText(id, val) {
var el = document.getElementById(id);
if (el) el.textContent = val;
}

// ============================================================
// DATA STORE
// ============================================================
var DB = {
leadership: null,
dominance:  null,
authority:  null,
enemy:      null,
local: { mercs: [], monsters: [], enemies: [] }
};

// ============================================================
// LOCALSTORAGE
// ============================================================
function lsGet(key) {
try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; }
}
function lsSet(key, val) {
try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}

// ============================================================
// LOAD DATA
// ============================================================
function loadData() {
DB.local.mercs    = lsGet(LS_KEYS.mercs)    || [];
DB.local.monsters = lsGet(LS_KEYS.monsters) || [];
DB.local.enemies  = lsGet(LS_KEYS.enemies)  || [];

var files = [
“data/troops_leadership.json”,
“data/troops_dominance.json”,
“data/troops_authority.json”,
“data/enemy_squads.json”
];

var results = [null, null, null, null];
var loaded  = 0;
var total   = files.length;

function onAllLoaded() {
DB.leadership = results[0];
DB.dominance  = results[1];
DB.authority  = results[2];
DB.enemy      = results[3] || { squads: { common:[], rare:[], heroic:[], citadels:[], epics:[], other:[] } };
updateDbStatus(!!results[0]);
populateEnemyDropdowns();
}

files.forEach(function(url, i) {
var xhr = new XMLHttpRequest();
xhr.open(“GET”, url, true);
xhr.onload = function() {
if (xhr.status === 200) {
try { results[i] = JSON.parse(xhr.responseText); } catch(e) {}
}
loaded++;
if (loaded === total) onAllLoaded();
};
xhr.onerror = function() {
loaded++;
if (loaded === total) onAllLoaded();
};
xhr.send();
});
}

function updateDbStatus(ok) {
var el = document.getElementById(“dbStatus”);
if (!el) return;
var n = DB.local.mercs.length + DB.local.monsters.length + DB.local.enemies.length;
el.textContent = ok
? (“✅ Base data loaded. “ + n + “ locally-added record(s).”)
: (“⚠️ Base JSON missing. “ + n + “ locally-added record(s).”);
el.style.color = ok ? “#4caf50” : “#e8a838”;
}

// ============================================================
// SQUAD HELPERS
// ============================================================
function getAllSquads() {
var base = (DB.enemy && DB.enemy.squads) ? DB.enemy.squads : {};
var baseList = [].concat(
base.common   || [],
base.rare     || [],
base.heroic   || [],
base.citadels || [],
base.epics    || [],
base.other    || []
).filter(function(s) { return s.squad_level > 0; });

var baseIds = {};
baseList.forEach(function(s) { baseIds[s.squad_id] = true; });

var localList = DB.local.enemies.filter(function(s) { return !baseIds[s.squad_id]; });
return baseList.concat(localList);
}

function findSquad(id) {
if (!id) return null;
var all = getAllSquads();
for (var i = 0; i < all.length; i++) {
if (all[i].squad_id === id) return all[i];
}
return null;
}

function populateEnemyDropdowns() {
var catEl = document.getElementById(“enemyCategory”);
if (!catEl) return;

var cats = [“all”,“common”,“rare”,“heroic”,“citadel_elven”,“citadel_cursed”,“epic”,“other”];
catEl.innerHTML = cats.map(function(c) {
return ‘<option value="' + c + '">’ + (c === “all” ? “All Categories” : formatLabel(c)) + ‘</option>’;
}).join(””);

filterSquadDropdown();
}

function filterSquadDropdown() {
var catEl   = document.getElementById(“enemyCategory”);
var squadEl = document.getElementById(“enemySquad”);
if (!squadEl) return;

var cat = catEl ? catEl.value : “all”;
var squads = getAllSquads().filter(function(s) {
return cat === “all” || s.category === cat;
});

var html = ‘<option value="">– None / Skip –</option>’;
squads.forEach(function(s) {
html += ‘<option value="' + s.squad_id + '">’ +
s.squad_name + ’ (Lvl ’ + s.squad_level + ’) — ’ + formatLabel(s.faction) +
‘</option>’;
});
squadEl.innerHTML = html;
onSquadSelected();
}

function onSquadSelected() {
var squad = findSquad(safeVal(“enemySquad”));

var engEl  = document.getElementById(“engineeringNote”);
var hintEl = document.getElementById(“leaderHint”);

if (engEl)  engEl.style.display  = (squad && squad.engineering_recommended) ? “block” : “none”;
if (hintEl) {
if (squad) {
var rules = (DB.enemy && DB.enemy.allowed_leaders_key) ? DB.enemy.allowed_leaders_key : {};
hintEl.textContent = “ℹ️ “ + (rules[squad.allowed_leaders] || formatLabel(squad.allowed_leaders || “”));
hintEl.style.display = “block”;
} else {
hintEl.style.display = “none”;
}
}
buildExcludeToggle(squad);
}

// ============================================================
// ENEMY ANALYSIS
// ============================================================
function analyzeEnemy(squad) {
if (!squad || !squad.units || squad.units.length === 0) return null;

var typeBonus    = { Ranged:0, Melee:0, Mounted:0, Flying:0 };
var subtypeBonus = {};

squad.units.forEach(function(u) {
var bonuses = u.bonuses || [];
bonuses.forEach(function(b) {
if (b.target_type && typeBonus[b.target_type] !== undefined)
typeBonus[b.target_type] += b.value;
if (b.target_subtype)
subtypeBonus[b.target_subtype] = (subtypeBonus[b.target_subtype] || 0) + b.value;
});
});

var warnings = [];
Object.keys(typeBonus).forEach(function(t) {
var v = typeBonus[t];
if (v > 0) warnings.push({
target: t, kind: “type”, value: v,
severity: v >= 50 ? “HIGH” : “MODERATE”,
message: “[” + (v>=50?“HIGH”:“MOD”) + “] Enemy +” + v + “% vs “ + t.toUpperCase() + “ troops”
});
});
Object.keys(subtypeBonus).forEach(function(s) {
var v = subtypeBonus[s];
if (v > 0) warnings.push({
target: s, kind: “subtype”, value: v,
severity: v >= 50 ? “HIGH” : “MODERATE”,
message: “[” + (v>=50?“HIGH”:“MOD”) + “] Enemy +” + v + “% vs “ + s + “ units specifically”
});
});

var totalUnits = squad.units.reduce(function(sum, u) { return sum + (u.count || 0); }, 0);
return { typeBonus: typeBonus, subtypeBonus: subtypeBonus, warnings: warnings, totalUnits: totalUnits };
}

function buildExcludeToggle(squad) {
var section = document.getElementById(“excludeSection”);
if (!section) return;
var analysis = analyzeEnemy(squad);
if (!analysis || analysis.warnings.length === 0) {
section.innerHTML = “”;
section.style.display = “none”;
return;
}

var affTypes = Object.keys(analysis.typeBonus).filter(function(t) { return analysis.typeBonus[t] > 0; });
var affSubs  = Object.keys(analysis.subtypeBonus).filter(function(s) { return analysis.subtypeBonus[s] > 0; });
var affAll   = affTypes.concat(affSubs).join(”, “);

var warnHtml = analysis.warnings.map(function(w) {
return ‘<div class="warning-line ' + w.severity.toLowerCase() + '">’ + w.message + ‘</div>’;
}).join(””);

section.innerHTML =
‘<div class="exclude-box">’ +
‘<div class="exclude-title">⚠️ Enemy Bonus Warnings</div>’ +
warnHtml +
‘<label class="exclude-toggle">’ +
‘<input type="checkbox" id="autoExclude" onchange="updateExcludeDisplay()">’ +
‘<span>Auto-exclude all affected types from my stack</span>’ +
‘</label>’ +
‘<div id="excludePreview" class="exclude-preview" style="display:none">’ +
‘Will remove from ALL pools: <strong>’ + affAll + ‘</strong>’ +
‘</div>’ +
‘</div>’;
section.style.display = “block”;
}

function updateExcludeDisplay() {
var cb = document.getElementById(“autoExclude”);
var pr = document.getElementById(“excludePreview”);
if (pr) pr.style.display = (cb && cb.checked) ? “block” : “none”;
}

function getExcludedTypes() {
var cb = document.getElementById(“autoExclude”);
var empty = { types: {}, subtypes: {} };
if (!cb || !cb.checked) return empty;
var squad    = findSquad(safeVal(“enemySquad”));
var analysis = analyzeEnemy(squad);
if (!analysis) return empty;
var types    = {};
var subtypes = {};
Object.keys(analysis.typeBonus).forEach(function(t) { if (analysis.typeBonus[t] > 0) types[t] = true; });
Object.keys(analysis.subtypeBonus).forEach(function(s) { if (analysis.subtypeBonus[s] > 0) subtypes[s] = true; });
return { types: types, subtypes: subtypes };
}

function isExcluded(excl, combat_type, subtype) {
return !!(excl.types[combat_type] || excl.subtypes[subtype]);
}

// ============================================================
// TIER HELPERS
// ============================================================
function getCheckedTiers(name) {
var boxes = document.querySelectorAll(‘input[name=”’ + name + ‘”]:checked’);
var tiers = [];
for (var i = 0; i < boxes.length; i++) tiers.push(parseInt(boxes[i].value));
return tiers.sort(function(a,b) { return b - a; });
}

// ============================================================
// CORE MATH
// ============================================================
function splitTroops(total, tierList, prefix) {
if (!total || total <= 0 || !tierList || tierList.length === 0) return {};
var maxTier  = tierList[0];
var tiers    = [];
var ratioSum = 0;
tierList.forEach(function(t) {
var r = Math.pow(TIER_MULTIPLIER, maxTier - t);
tiers.push({ tier: t, ratio: r });
ratioSum += r;
});
var results   = {};
var remaining = total;
tiers.forEach(function(t) {
var c = Math.floor((total * t.ratio) / ratioSum);
results[prefix + t.tier] = c;
remaining -= c;
});
results[prefix + maxTier] = (results[prefix + maxTier] || 0) + remaining;
return results;
}

function tierLines(obj) {
var lines = [];
Object.keys(obj).forEach(function(k) {
if (obj[k] > 0) lines.push(”    “ + k + “: “ + obj[k].toLocaleString());
});
return lines.join(”\n”) + (lines.length ? “\n” : “”);
}

// 2-2-1 allocation:
// rw=2 → ranged gets 2/5 of leadership (1 leadership/unit)
// mw=2 → melee  gets 2/5 of leadership (1 leadership/unit)
// cw=1 → mounted gets 1/5 of leadership (2 leadership/unit → headcount = share/2)
function allocate3(budget, rw, mw, cw) {
var totalW = rw + mw + cw;
if (totalW <= 0) return { rangedN:0, meleeN:0, mountedN:0, rangedL:0, meleeL:0, mountedL:0 };
var rangedL  = Math.floor(budget * rw / totalW);
var meleeL   = Math.floor(budget * mw / totalW);
var mountedL = budget - rangedL - meleeL;
return {
rangedN:  rangedL,
meleeN:   meleeL,
mountedN: Math.floor(mountedL / 2),
rangedL:  rangedL,
meleeL:   meleeL,
mountedL: mountedL
};
}

// ============================================================
// MAIN CALCULATE
// ============================================================
function calculate() {
var leadership = parseInt(safeVal(“leadershipCap”)) || 0;
var dominance  = parseInt(safeVal(“dominanceCap”))  || 0;
var authority  = parseInt(safeVal(“authorityCap”))  || 0;

if (!leadership && !dominance && !authority) {
alert(“Enter at least one resource cap.”); return;
}

var tiersG    = getCheckedTiers(“tierG”);
var tiersS    = getCheckedTiers(“tierS”);
var tiersE    = getCheckedTiers(“tierE”);
var tiersM    = getCheckedTiers(“tierM”);
var tiersMerc = getCheckedTiers(“tierMerc”);

var squadId  = safeVal(“enemySquad”);
var squad    = findSquad(squadId);
var analysis = analyzeEnemy(squad);
var excl     = getExcludedTypes();

var out = “”;
out += “╔══════════════════════════════════════════╗\n”;
out += “   TOTAL BATTLE STACK CALCULATOR  v4.1\n”;
out += “╚══════════════════════════════════════════╝\n\n”;
out += “Tier Multiplier: “ + TIER_MULTIPLIER + “x\n”;
if (tiersG.length)    out += “Guardsmen      : “ + tiersG.map(function(t){return “G”+t;}).join(”, “) + “\n”;
if (tiersS.length)    out += “Specialists    : “ + tiersS.map(function(t){return “S”+t;}).join(”, “) + “\n”;
if (tiersE.length)    out += “Engineering    : “ + tiersE.map(function(t){return “E”+t;}).join(”, “) + “\n”;
if (tiersM.length)    out += “Player Monsters: “ + tiersM.map(function(t){return “M”+t;}).join(”, “) + “\n”;
if (tiersMerc.length) out += “Mercenaries    : “ + tiersMerc.map(function(t){return “T”+t;}).join(”, “) + “\n”;

// Enemy info
if (squad) {
out += “\n━━━ ENEMY SQUAD ━━━━━━━━━━━━━━━━━━━━━━━━━━\n”;
out += squad.squad_name + “ — Level “ + squad.squad_level + “\n”;
out += “Category: “ + formatLabel(squad.category) + “   Faction: “ + formatLabel(squad.faction) + “\n”;
if (analysis && analysis.totalUnits > 0) {
out += “Total enemy units: “ + analysis.totalUnits.toLocaleString() + “\n”;
squad.units.forEach(function(u) {
var bonusTxt = (u.bonuses || []).map(function(b) {
return b.target_type
? (”+” + b.value + “% vs “ + b.target_type)
: (”+” + b.value + “% vs “ + b.target_subtype);
}).join(”, “);
out += “  • “ + ((u.count||”?”).toLocaleString ? (u.count||”?”).toLocaleString() : (u.count||”?”)) +
“ “ + u.unit_name +
“ [” + (u.combat_type || u.unit_class || “?”) + (u.subtype ? “, “ + u.subtype : “”) + “]”;
if (bonusTxt) out += “ ← “ + bonusTxt;
out += “\n”;
});
}
}

// Warnings
if (analysis && analysis.warnings.length > 0) {
out += “\n━━━ ⚠️  WARNINGS ━━━━━━━━━━━━━━━━━━━━━━━━━━\n”;
analysis.warnings.forEach(function(w) { out += w.message + “\n”; });
var exclList = Object.keys(excl.types).concat(Object.keys(excl.subtypes));
if (exclList.length > 0) out += “🚫 AUTO-EXCLUDED: “ + exclList.join(”, “) + “\n”;
}

// ── LEADERSHIP ─────────────────────────────────────────
if (leadership > 0) {
out += “\n━━━ LEADERSHIP POOL: “ + leadership.toLocaleString() + “ ━━━━━━━━━━━━━━━━━━\n”;

```
var isCitadel = squad && (squad.category === "citadel_elven" || squad.category === "citadel_cursed" || squad.category === "pvp");
var showEng   = isCitadel && tiersE.length > 0;
var engRes    = showEng ? Math.floor(leadership * 0.15) : 0;
var combatL   = leadership - engRes;

var hasG = tiersG.length > 0;
var hasS = tiersS.length > 0;
var gL   = Math.floor(combatL * (hasG && hasS ? 0.5 : hasG ? 1 : 0));
var sL   = Math.floor(combatL * (hasG && hasS ? 0.5 : hasS ? 1 : 0));

// GUARDSMEN
if (hasG && gL > 0) {
  var rw = isExcluded(excl, "Ranged",  "Human") ? 0 : 2;
  var mw = isExcluded(excl, "Melee",   "Human") ? 0 : 2;
  var cw = isExcluded(excl, "Mounted", "Human") ? 0 : 1;
  var fw = isExcluded(excl, "Flying",  "Beast") ? 0 : 1;

  out += "\n--- Guardsmen (" + gL.toLocaleString() + " leadership) ---\n";
  if (rw + mw + cw <= 0) {
    out += "  ALL types excluded by enemy bonuses.\n";
  } else {
    var ga = allocate3(gL, rw, mw, cw);
    if (ga.rangedN > 0) {
      out += "🏹 Archers [Ranged, Human] — " + ga.rangedN.toLocaleString() + " (" + ga.rangedL.toLocaleString() + " leadership)\n";
      out += tierLines(splitTroops(ga.rangedN, tiersG, "G"));
    }
    if (ga.meleeN > 0) {
      out += "🗡️  Spearmen [Melee, Human] — " + ga.meleeN.toLocaleString() + " (" + ga.meleeL.toLocaleString() + " leadership)\n";
      out += tierLines(splitTroops(ga.meleeN, tiersG, "G"));
    }
    if (ga.mountedN > 0) {
      out += "🐎 Riders [Mounted, Human] — " + ga.mountedN.toLocaleString() + " headcount (" + ga.mountedL.toLocaleString() + " leadership, x2 cost)\n";
      out += tierLines(splitTroops(ga.mountedN, tiersG, "G"));
    }
    if (fw > 0 && tiersG.filter(function(t){return t>=5;}).length > 0) {
      out += "🦅 Griffins/Corax [Flying, Beast] available G5+ — allocate from Ranged budget.\n";
    }
  }
}

// SPECIALISTS
if (hasS && sL > 0) {
  var srw = isExcluded(excl, "Ranged",  "Human") ? 0 : 2;
  var smw = isExcluded(excl, "Melee",   "Human") ? 0 : 2;
  var scw = isExcluded(excl, "Mounted", "Human") ? 0 : 1;

  out += "\n--- Specialists (" + sL.toLocaleString() + " leadership) ---\n";
  if (srw + smw + scw <= 0) {
    out += "  ALL types excluded by enemy bonuses.\n";
  } else {
    var sa = allocate3(sL, srw, smw, scw);
    if (sa.rangedN > 0) {
      out += "🏹 Vultures/Deadshot [Ranged, Human] — " + sa.rangedN.toLocaleString() + " (" + sa.rangedL.toLocaleString() + " leadership)\n";
      out += tierLines(splitTroops(sa.rangedN, tiersS, "S"));
    }
    if (sa.meleeN > 0) {
      out += "🗡️  Swordsmen [Melee, Human] — " + sa.meleeN.toLocaleString() + " (" + sa.meleeL.toLocaleString() + " leadership)\n";
      out += tierLines(splitTroops(sa.meleeN, tiersS, "S"));
    }
    if (sa.mountedN > 0) {
      out += "🐎 Lion Riders [Mounted, Human] — " + sa.mountedN.toLocaleString() + " headcount (" + sa.mountedL.toLocaleString() + " leadership, x2 cost)\n";
      out += tierLines(splitTroops(sa.mountedN, tiersS, "S"));
    }
    if (!isExcluded(excl, "Flying", "Human") && tiersS.filter(function(t){return t>=8;}).length > 0) {
      out += "🦅 Royal Lions [Flying, Human] available S8+ — allocate from Ranged budget.\n";
    }
  }
}

// ENGINEERING
if (showEng && engRes > 0) {
  out += "\n--- Engineering Corps (" + engRes.toLocaleString() + " leadership — 15% reserve) ---\n";
  out += "⚙️  Siege Engines [Siege, Human]\n";
  out += tierLines(splitTroops(engRes, tiersE, "E"));
}

out += "\nLeadership consumed: " + leadership.toLocaleString() + " / " + leadership.toLocaleString() + "\n";
```

}

// ── DOMINANCE ──────────────────────────────────────────
if (dominance > 0 && tiersM.length > 0) {
out += “\n━━━ DOMINANCE POOL: “ + dominance.toLocaleString() + “ ━━━━━━━━━━━━━━━━━━━━\n”;
var availM = DB.local.monsters.filter(function(m) { return !isExcluded(excl, m.combat_type, m.subtype); });
if (availM.length > 0) {
out += “Available monsters (after exclusions):\n”;
availM.forEach(function(m) {
out += “  “ + m.name + “ [” + m.combat_type + “, “ + m.subtype + “] T” + (m.tier||”?”) +
“ STR:” + (m.strength||”?”) + “ HP:” + (m.health||”?”) + “ Cost:” + (m.resource_cost||”?”) + “\n”;
});
out += “\n”;
} else {
out += “(Add monsters via ⚙️ Manage Data)\n”;
}
out += “🐲 PLAYER MONSTERS (tier split)\n”;
out += tierLines(splitTroops(dominance, tiersM, “M”));
out += “Dominance consumed: “ + dominance.toLocaleString() + “ / “ + dominance.toLocaleString() + “\n”;
}

// ── AUTHORITY ──────────────────────────────────────────
if (authority > 0 && tiersMerc.length > 0) {
out += “\n━━━ AUTHORITY POOL: “ + authority.toLocaleString() + “ ━━━━━━━━━━━━━━━━━━━━\n”;
var availA = DB.local.mercs.filter(function(m) { return !isExcluded(excl, m.combat_type, m.subtype); });
if (availA.length > 0) {
out += “Available mercenaries (after exclusions):\n”;
availA.forEach(function(m) {
out += “  “ + m.name + “ [” + m.combat_type + “, “ + m.subtype + “] T” + (m.tier||”?”) +
“ STR:” + (m.strength||”?”) + “ HP:” + (m.health||”?”) + “ Cost:” + (m.resource_cost||”?”) + “\n”;
});
out += “\n”;
} else {
out += “(Add mercs via ⚙️ Manage Data)\n”;
}
out += “⚔️  MERCENARIES (tier split)\n”;
var mercRes = splitTroops(authority, tiersMerc, “T”);
Object.keys(mercRes).forEach(function(k) {
if (mercRes[k] > 0) out += “    Tier ~“ + k.replace(“T”,””) + “: “ + mercRes[k].toLocaleString() + “\n”;
});
out += “Authority consumed: “ + authority.toLocaleString() + “ / “ + authority.toLocaleString() + “\n”;
}

var outEl = document.getElementById(“output”);
if (outEl) outEl.textContent = out;
}

// ============================================================
// DATA MODAL
// ============================================================
var modalTab = “mercs”;

function openDataModal() {
var el = document.getElementById(“dataModal”);
if (el) el.style.display = “flex”;
switchModalTab(modalTab);
}

function closeDataModal() {
var el = document.getElementById(“dataModal”);
if (el) el.style.display = “none”;
}

function switchModalTab(tab) {
modalTab = tab;
[“mercs”,“monsters”,“enemies”].forEach(function(t) {
var btn = document.getElementById(“tab-” + t);
if (!btn) return;
if (t === tab) btn.className = “modal-tab active”;
else           btn.className = “modal-tab”;
});
renderModalContent();
}

function renderModalContent() {
var c = document.getElementById(“modalContent”);
if (!c) return;
if (modalTab === “mercs”)    renderMercsTab(c);
if (modalTab === “monsters”) renderMonstersTab(c);
if (modalTab === “enemies”)  renderEnemiesTab(c);
}

function buildUnitForm(type) {
var id  = “new-” + type;
var typeOpts  = COMBAT_TYPES.map(function(t){return ‘<option>’+t+’</option>’;}).join(””);
var subOpts   = SUBTYPES.map(function(s){return ‘<option>’+s+’</option>’;}).join(””);
return ‘<div class="form-group-row">’ +
‘<input id="'+id+'-name"  placeholder="Unit name" class="form-input" />’ +
‘<select id="'+id+'-type" class="form-input short">’+typeOpts+’</select>’ +
‘<select id="'+id+'-sub"  class="form-input short">’+subOpts+’</select>’ +
‘<input id="'+id+'-tier"  type="number" placeholder="Tier" class="form-input short" min="1" max="9"/>’ +
‘<input id="'+id+'-str"   type="number" placeholder="Strength" class="form-input short" />’ +
‘<input id="'+id+'-hp"    type="number" placeholder="Health" class="form-input short" />’ +
‘<input id="'+id+'-cost"  type="number" placeholder="Resource cost" class="form-input short" />’ +
‘<button class="btn-add" onclick="addUnit(\''+type+'s\')">+ Add</button>’ +
‘</div>’;
}

function unitRowHtml(m, pool, i) {
return ‘<div class="unit-row">’ +
‘<span class="unit-name">’+m.name+’</span>’ +
‘<span class="unit-tags">’+m.combat_type+’ · ‘+m.subtype+’ · T’+(m.tier||”?”)+’</span>’ +
‘<span class="unit-stats">STR:’+(m.strength||”?”)+’ HP:’+(m.health||”?”)+’ Cost:’+(m.resource_cost||”?”)+’</span>’ +
‘<button class="btn-delete" onclick="deleteUnit(\''+pool+'\','+i+')">✕</button>’ +
‘</div>’;
}

function renderMercsTab(c) {
var rows = DB.local.mercs.map(function(m,i){return unitRowHtml(m,“mercs”,i);}).join(””);
c.innerHTML = ‘<div class="modal-section">’ +
‘<h3>Mercenaries <span class="count-badge">’+DB.local.mercs.length+’</span></h3>’ +
‘<p class="hint">Examples: Arbalaster VII (Ranged, Guardsman), Golden Dragon VII (Flying, Dragon), Jungle King (Melee, Beast).</p>’ +
buildUnitForm(“merc”) +
(rows ? ‘<div class="unit-list">’+rows+’</div>’ : ‘<p class="hint empty-hint">No mercenaries added yet.</p>’) +
‘<button class="btn-export" onclick="exportJSON(\'mercs\')">⬇️ Export mercs JSON</button>’ +
‘</div>’;
}

function renderMonstersTab(c) {
var rows = DB.local.monsters.map(function(m,i){return unitRowHtml(m,“monsters”,i);}).join(””);
c.innerHTML = ‘<div class="modal-section">’ +
‘<h3>Player Monsters <span class="count-badge">’+DB.local.monsters.length+’</span></h3>’ +
‘<p class="hint">Add your owned monsters from Barracks > Monsters.</p>’ +
buildUnitForm(“monster”) +
(rows ? ‘<div class="unit-list">’+rows+’</div>’ : ‘<p class="hint empty-hint">No player monsters added yet.</p>’) +
‘<button class="btn-export" onclick="exportJSON(\'monsters\')">⬇️ Export monsters JSON</button>’ +
‘</div>’;
}

function renderEnemiesTab(c) {
var cats = [“common”,“rare”,“heroic”,“citadel_elven”,“citadel_cursed”,“epic”,“other”];
var facs = [“barbarian”,“inferno”,“undead”,“elf”,“cursed”,“other”];
var catOpts = cats.map(function(x){return ‘<option value="'+x+'">’+formatLabel(x)+’</option>’;}).join(””);
var facOpts = facs.map(function(x){return ‘<option value="'+x+'">’+formatLabel(x)+’</option>’;}).join(””);
var typeOpts= COMBAT_TYPES.map(function(t){return ‘<option>’+t+’</option>’;}).join(””);
var subOpts = SUBTYPES.map(function(s){return ‘<option>’+s+’</option>’;}).join(””);

var squadBlocks = DB.local.enemies.map(function(sq, si) {
var unitRows = (sq.units||[]).map(function(u, ui) {
var bt = (u.bonuses||[]).map(function(b){
return b.target_type ? (”+”+b.value+”% vs “+b.target_type) : (”+”+b.value+”% vs “+b.target_subtype);
}).join(”, “);
return ‘<div class="unit-row sub">’ +
‘<span class="unit-name">’+u.unit_name+’ x’+(u.count||”?”)+’</span>’ +
‘<span class="unit-tags">’+(u.combat_type||””)+’ · ‘+(u.subtype||””)+’</span>’ +
‘<span class="unit-stats">’+(bt||“no bonuses”)+’</span>’ +
‘<button class="btn-delete" onclick="deleteEnemyUnit('+si+','+ui+')">✕</button>’ +
‘</div>’;
}).join(””);

```
return '<div class="squad-block">' +
  '<div class="squad-header">' +
    '<span>'+sq.squad_name+' (Lvl '+sq.squad_level+') — '+formatLabel(sq.faction)+' ['+formatLabel(sq.category)+']</span>' +
    '<button class="btn-delete" onclick="deleteEnemySquad('+si+')">✕ Remove</button>' +
  '</div>' +
  unitRows +
  '<div class="form-group-row sub-form">' +
    '<input id="eu-name-'+si+'"  placeholder="Unit name" class="form-input" />' +
    '<input id="eu-count-'+si+'" type="number" placeholder="Count" class="form-input short" />' +
    '<select id="eu-type-'+si+'" class="form-input short">'+typeOpts+'</select>' +
    '<select id="eu-sub-'+si+'"  class="form-input short">'+subOpts+'</select>' +
    '<input id="eu-btype-'+si+'" placeholder="Type bonuses e.g. Melee:35,Mounted:20" class="form-input" />' +
    '<input id="eu-bsub-'+si+'"  placeholder="Subtype bonuses e.g. Dragon:50" class="form-input" />' +
    '<button class="btn-add small" onclick="addEnemyUnit('+si+')">+ Unit</button>' +
  '</div>' +
  '</div>';
```

}).join(””);

c.innerHTML = ‘<div class="modal-section">’ +
‘<h3>Enemy Squads <span class="count-badge">’+DB.local.enemies.length+’</span></h3>’ +
‘<p class="hint">Add squads you encounter. Bonus format: <code>Melee:35,Mounted:20</code></p>’ +
‘<div class="form-group-row">’ +
‘<input id="ns-name"  placeholder="Squad name" class="form-input" />’ +
‘<input id="ns-level" type="number" placeholder="Level" class="form-input short" />’ +
‘<select id="ns-cat" class="form-input">’+catOpts+’</select>’ +
‘<select id="ns-fac" class="form-input">’+facOpts+’</select>’ +
‘<button class="btn-add" onclick="addEnemySquad()">+ Add Squad</button>’ +
‘</div>’ +
(squadBlocks || ‘<p class="hint empty-hint">No local enemy squads yet. Base JSON squads always available.</p>’) +
‘<button class="btn-export" onclick="exportJSON(\'enemies\')">⬇️ Export enemy squads JSON</button>’ +
‘</div>’;
}

// ============================================================
// DATA CRUD
// ============================================================
function addUnit(pool) {
var type = pool === “mercs” ? “merc” : “monster”;
var pfx  = “new-” + type;
var nameEl = document.getElementById(pfx + “-name”);
var name   = nameEl ? nameEl.value.trim() : “”;
if (!name) { alert(“Enter a unit name.”); return; }

DB.local[pool].push({
name:          name,
combat_type:   safeVal(pfx + “-type”),
subtype:       safeVal(pfx + “-sub”),
tier:          parseInt(safeVal(pfx + “-tier”)) || null,
strength:      parseInt(safeVal(pfx + “-str”))  || null,
health:        parseInt(safeVal(pfx + “-hp”))   || null,
resource_cost: parseInt(safeVal(pfx + “-cost”)) || null,
bonuses: []
});
lsSet(LS_KEYS[pool], DB.local[pool]);
updateDbStatus(true);
renderModalContent();
}

function deleteUnit(pool, i) {
DB.local[pool].splice(i, 1);
lsSet(LS_KEYS[pool], DB.local[pool]);
updateDbStatus(true);
renderModalContent();
}

function addEnemySquad() {
var nameEl = document.getElementById(“ns-name”);
var name   = nameEl ? nameEl.value.trim() : “”;
var level  = parseInt(safeVal(“ns-level”)) || 0;
var cat    = safeVal(“ns-cat”);
var fac    = safeVal(“ns-fac”);
if (!name) { alert(“Enter a squad name.”); return; }

var allowedMap = {
rare:“hero_only”, common:“captain_only”, heroic:“hero_plus_3_max”,
citadel_elven:“hero_plus_3_max”, citadel_cursed:“hero_plus_3_max”,
epic:“captain_1_max”, other:“captain_only”
};
DB.local.enemies.push({
squad_id: “local_” + cat + “_” + fac + “*L” + level + “*” + Date.now(),
squad_name: name, squad_level: level, category: cat, faction: fac,
allowed_leaders: allowedMap[cat] || “captain_only”,
engineering_recommended: (cat === “citadel_elven” || cat === “citadel_cursed”),
units: []
});
lsSet(LS_KEYS.enemies, DB.local.enemies);
filterSquadDropdown();
renderModalContent();
}

function deleteEnemySquad(i) {
DB.local.enemies.splice(i, 1);
lsSet(LS_KEYS.enemies, DB.local.enemies);
filterSquadDropdown();
renderModalContent();
}

function addEnemyUnit(si) {
var nameEl = document.getElementById(“eu-name-” + si);
var name   = nameEl ? nameEl.value.trim() : “”;
var count  = parseInt(safeVal(“eu-count-” + si)) || 0;
var ctype  = safeVal(“eu-type-” + si);
var sub    = safeVal(“eu-sub-”  + si);
var btRaw  = safeVal(“eu-btype-” + si).trim();
var bsRaw  = safeVal(“eu-bsub-”  + si).trim();
if (!name) { alert(“Enter a unit name.”); return; }

var bonuses = [];
if (btRaw) btRaw.split(”,”).forEach(function(p) {
var parts = p.split(”:”).map(function(s){return s.trim();});
if (parts[0] && parts[1]) bonuses.push({ target_type: parts[0], value: parseInt(parts[1]) });
});
if (bsRaw) bsRaw.split(”,”).forEach(function(p) {
var parts = p.split(”:”).map(function(s){return s.trim();});
if (parts[0] && parts[1]) bonuses.push({ target_subtype: parts[0], value: parseInt(parts[1]) });
});

DB.local.enemies[si].units.push({
unit_id: “lu_” + Date.now(), unit_name: name, count: count,
combat_type: ctype, subtype: sub,
strength: null, health: null, leadership: 1, initiative: null, bonuses: bonuses
});
lsSet(LS_KEYS.enemies, DB.local.enemies);
filterSquadDropdown();
renderModalContent();
}

function deleteEnemyUnit(si, ui) {
DB.local.enemies[si].units.splice(ui, 1);
lsSet(LS_KEYS.enemies, DB.local.enemies);
renderModalContent();
}

function exportJSON(pool) {
var data = pool === “enemies”
? { version:“4.1”, squads: DB.local.enemies }
: { version:“4.1”, units:  DB.local[pool] };
var blob = new Blob([JSON.stringify(data, null, 2)], { type: “application/json” });
var a = document.createElement(“a”);
a.href = URL.createObjectURL(blob);
a.download = “tb_local_” + pool + “.json”;
a.click();
}

// ============================================================
// UTILITY & INIT
// ============================================================
function formatLabel(str) {
if (!str) return “”;
return str.replace(/_/g, “ “).replace(/\b\w/g, function(c){ return c.toUpperCase(); });
}

window.addEventListener(“DOMContentLoaded”, function() { loadData(); });