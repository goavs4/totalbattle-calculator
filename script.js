// ============================================================
// Total Battle Stacking Calculator - v3.0
// ============================================================
// Resource pools:
//   Leadership  → Guardsmen, Specialists, Engineering Corps
//   Dominance   → Player Monsters (M1-M9)
//   Authority   → Mercenaries (all classes)
// All three are independent caps on the same march.
// ============================================================

const TIER_MULTIPLIER = 1.9;

// ---- Global Data Store ----
let DB = {
  leadership: null,   // troops_leadership.json
  dominance:  null,   // troops_dominance.json
  authority:  null,   // troops_authority.json
  enemy:      null    // enemy_squads.json
};

// ---- Load all JSON on page load ----
async function loadData() {
  try {
    const [l, d, a, e] = await Promise.all([
      fetch("data/troops_leadership.json").then(r => r.json()),
      fetch("data/troops_dominance.json").then(r => r.json()),
      fetch("data/troops_authority.json").then(r => r.json()),
      fetch("data/enemy_squads.json").then(r => r.json())
    ]);
    DB.leadership = l;
    DB.dominance  = d;
    DB.authority  = a;
    DB.enemy      = e;
    console.log("✅ All data loaded.");
    populateEnemyDropdowns();
    updateDbStatus(true);
  } catch (err) {
    console.warn("⚠️ Data files not found. Running in standalone mode.", err);
    updateDbStatus(false);
  }
}

function updateDbStatus(ok) {
  const el = document.getElementById("dbStatus");
  if (!el) return;
  if (ok) {
    el.textContent = "✅ Enemy database loaded.";
    el.style.color = "#4caf50";
  } else {
    el.textContent = "⚠️ Could not load data files. Add data/ folder to repo.";
    el.style.color = "#e8a838";
  }
}

// ---- Flatten all squads from all categories ----
function getAllSquads() {
  if (!DB.enemy) return [];
  const s = DB.enemy.squads;
  return [
    ...(s.common   || []),
    ...(s.rare     || []),
    ...(s.heroic   || []),
    ...(s.citadels || []),
    ...(s.epics    || []),
    ...(s.other    || [])
  ].filter(sq => sq.squad_level > 0); // exclude templates
}

// ---- Populate enemy category and squad dropdowns ----
function populateEnemyDropdowns() {
  const catSelect   = document.getElementById("enemyCategory");
  const squadSelect = document.getElementById("enemySquad");
  if (!catSelect || !squadSelect || !DB.enemy) return;

  // Populate category filter
  const categories = ["all", "common", "rare", "heroic", "citadel_elven", "citadel_cursed", "epic", "other"];
  catSelect.innerHTML = "";
  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c === "all" ? "All Categories" : formatLabel(c);
    catSelect.appendChild(opt);
  });

  filterSquadDropdown();
}

function filterSquadDropdown() {
  const catSelect   = document.getElementById("enemyCategory");
  const squadSelect = document.getElementById("enemySquad");
  if (!squadSelect) return;

  const selectedCat = catSelect ? catSelect.value : "all";
  const allSquads   = getAllSquads();

  squadSelect.innerHTML = '<option value="">-- None / Skip enemy analysis --</option>';

  allSquads
    .filter(sq => selectedCat === "all" || sq.category === selectedCat)
    .forEach(sq => {
      const opt = document.createElement("option");
      opt.value = sq.squad_id;
      opt.textContent = `${sq.squad_name} (Lvl ${sq.squad_level}) — ${formatLabel(sq.faction)}`;
      squadSelect.appendChild(opt);
    });

  onSquadSelected(); // reset UI state
}

// ---- When a squad is selected, update UI accordingly ----
function onSquadSelected() {
  const squadId = document.getElementById("enemySquad")?.value || "";
  const squad   = getAllSquads().find(s => s.squad_id === squadId) || null;

  // Show/hide engineering recommendation
  const engSection = document.getElementById("engineeringNote");
  if (engSection) {
    engSection.style.display = (squad && squad.engineering_recommended) ? "block" : "none";
  }

  // Show leader rules hint
  const leaderHint = document.getElementById("leaderHint");
  if (leaderHint && squad) {
    const rules = DB.enemy?.allowed_leaders_key || {};
    leaderHint.textContent = `ℹ️ ${rules[squad.allowed_leaders] || squad.allowed_leaders}`;
    leaderHint.style.display = "block";
  } else if (leaderHint) {
    leaderHint.style.display = "none";
  }
}

// ---- Analyze enemy squad for bonus warnings ----
function analyzeEnemy(squad) {
  if (!squad || !squad.units || squad.units.length === 0) return null;

  let dangers = { melee: 0, ranged: 0, cavalry: 0, flying: 0 };
  let warnings = [];

  squad.units.forEach(unit => {
    (unit.bonuses || []).forEach(b => {
      if (b.type === "strength_vs_melee")   dangers.melee   += b.value;
      if (b.type === "strength_vs_ranged")  dangers.ranged  += b.value;
      if (b.type === "strength_vs_cavalry") dangers.cavalry += b.value;
      if (b.type === "strength_vs_flying")  dangers.flying  += b.value;
    });
  });

  const totalUnits = squad.units.reduce((sum, u) => sum + (u.count || 0), 0);

  Object.entries(dangers).forEach(([cls, val]) => {
    if (val > 0) {
      const sev = val >= 50 ? "HIGH" : "MODERATE";
      warnings.push({ severity: sev, class: cls, value: val,
        message: `[${sev}] Enemy +${val}% strength vs ${cls.toUpperCase()} — reduce ${cls} troops in your stack.` });
    }
  });

  return { dangers, warnings, totalUnits };
}

// ---- Adjust troop weights based on enemy dangers ----
// Returns weight multipliers: 1.0 = full, 0.5 = halved
function adjustWeights(analysis) {
  let w = { archer: 1.0, spear: 1.0, rider: 1.0 };
  if (!analysis) return w;
  const d = analysis.dangers;
  if (d.ranged  >= 35) w.archer *= 0.7;
  if (d.ranged  >= 70) w.archer *= 0.5;
  if (d.melee   >= 35) w.spear  *= 0.7;
  if (d.melee   >= 70) w.spear  *= 0.5;
  if (d.cavalry >= 35) w.rider  *= 0.7;
  if (d.cavalry >= 70) w.rider  *= 0.5;
  return w;
}

// ---- Read checked tiers for a given checkbox group ----
// Returns sorted array highest-first e.g. [6,5,4]
function getCheckedTiers(name) {
  const boxes = document.querySelectorAll(`input[name="${name}"]:checked`);
  return Array.from(boxes).map(b => parseInt(b.value)).sort((a,b) => b - a);
}

// ---- Core tier split using 1.9x multiplier ----
// tierList: array of tier numbers highest-first e.g. [6,5,4]
// prefix:   "G", "S", "M", "E", "T"
function splitTroops(total, tierList, prefix) {
  if (!total || total <= 0 || !tierList || tierList.length === 0) return {};
  const maxTier = tierList[0];
  let tiers = [], ratioSum = 0;
  tierList.forEach(t => {
    const ratio = Math.pow(TIER_MULTIPLIER, maxTier - t);
    tiers.push({ tier: t, ratio });
    ratioSum += ratio;
  });
  let results = {}, remaining = total;
  tiers.forEach(t => {
    const count = Math.floor((total * t.ratio) / ratioSum);
    results[prefix + t.tier] = count;
    remaining -= count;
  });
  results[prefix + maxTier] += remaining; // leftover → highest tier
  return results;
}

// ---- Format tier split output lines ----
function tierLines(obj, prefix) {
  let s = "";
  // Output highest tier first (object keys are insertion order = highest first)
  Object.entries(obj).forEach(([k,v]) => { if(v > 0) s += `    ${k}: ${v.toLocaleString()}\n`; });
  return s;
}

// ---- Main calculate ----
function calculate() {

  // --- Resource caps ---
  const leadership = parseInt(document.getElementById("leadershipCap").value) || 0;
  const dominance  = parseInt(document.getElementById("dominanceCap").value)  || 0;
  const authority  = parseInt(document.getElementById("authorityCap").value)  || 0;

  if (leadership <= 0 && dominance <= 0 && authority <= 0) {
    alert("Enter at least one resource cap (Leadership, Dominance, or Authority).");
    return;
  }

  // --- Checked tiers per troop type ---
  const tiersG    = getCheckedTiers("tierG");
  const tiersS    = getCheckedTiers("tierS");
  const tiersE    = getCheckedTiers("tierE");
  const tiersM    = getCheckedTiers("tierM");
  const tiersMerc = getCheckedTiers("tierMerc");

  const hasLeadershipTroops = tiersG.length > 0 || tiersS.length > 0 || tiersE.length > 0;

  if (leadership > 0 && !hasLeadershipTroops) {
    alert("You entered a Leadership cap but have no G, S, or E tiers checked.");
    return;
  }
  if (dominance > 0 && tiersM.length === 0) {
    alert("You entered a Dominance cap but have no M tiers checked.");
    return;
  }
  if (authority > 0 && tiersMerc.length === 0) {
    alert("You entered an Authority cap but have no Mercenary tiers checked.");
    return;
  }

  // --- Enemy analysis ---
  const squadId  = document.getElementById("enemySquad")?.value || "";
  const squad    = getAllSquads().find(s => s.squad_id === squadId) || null;
  const analysis = analyzeEnemy(squad);
  const weights  = adjustWeights(analysis);

  // --- Build output ---
  let out = "";
  out += `╔══════════════════════════════════════════╗\n`;
  out += `   TOTAL BATTLE STACK CALCULATOR  v3.0\n`;
  out += `╚══════════════════════════════════════════╝\n\n`;
  out += `Tier Multiplier: ${TIER_MULTIPLIER}x\n`;

  // Tier summary line
  if (tiersG.length)    out += `Guardsmen      : ${tiersG.map(t=>"G"+t).join(", ")}\n`;
  if (tiersS.length)    out += `Specialists    : ${tiersS.map(t=>"S"+t).join(", ")}\n`;
  if (tiersE.length)    out += `Engineering    : ${tiersE.map(t=>"E"+t).join(", ")}\n`;
  if (tiersM.length)    out += `Player Monsters: ${tiersM.map(t=>"M"+t).join(", ")}\n`;
  if (tiersMerc.length) out += `Mercenaries    : ${tiersMerc.map(t=>"T"+t).join(", ")}\n`;

  // ---- Enemy info ----
  if (squad) {
    out += `\n━━━ ENEMY SQUAD ━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    out += `${squad.squad_name} — Level ${squad.squad_level}\n`;
    out += `Category: ${formatLabel(squad.category)}   Faction: ${formatLabel(squad.faction)}\n`;
    if (analysis && analysis.totalUnits > 0) {
      out += `Total units: ${analysis.totalUnits.toLocaleString()}\n`;
      squad.units.forEach(u => {
        out += `  • ${(u.count||"?").toLocaleString()} ${u.unit_name} (${u.unit_class})`;
        if (u.bonuses?.length) out += ` [${u.bonuses.map(b=>`+${b.value}% vs ${b.type.replace("strength_vs_","")}`).join(", ")}]`;
        out += "\n";
      });
    }
  }

  // ---- Warnings ----
  if (analysis?.warnings.length > 0) {
    out += `\n━━━ ⚠️  WARNINGS ━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    analysis.warnings.forEach(w => out += `${w.message}\n`);
    out += `Stack adjusted for enemy bonuses.\n`;
  }

  // ================================================================
  // POOL 1: LEADERSHIP
  // ================================================================
  if (leadership > 0) {
    out += `\n━━━ LEADERSHIP POOL: ${leadership.toLocaleString()} ━━━━━━━━━━━━━━━━━━\n`;

    const isCitadel = squad && (squad.category === "citadel_elven" || squad.category === "citadel_cursed");
    const isPvP     = squad && squad.category === "pvp";
    const showEng   = (isCitadel || isPvP) && tiersE.length > 0;

    // Split leadership between G (and S if checked) troops
    // If both G and S tiers checked, split leadership equally between them
    const hasG = tiersG.length > 0;
    const hasS = tiersS.length > 0;
    const hasE = tiersE.length > 0 && showEng;

    // Simple split: if G+S both present, 50/50. Engineering gets a fixed slice if citadel.
    let engReserve = 0;
    if (hasE) {
      engReserve = Math.floor(leadership * 0.15); // reserve 15% for engineering on citadel/pvp
    }
    const combatLeadership = leadership - engReserve;

    // G vs S split
    const gShare = (hasG && hasS) ? 0.5 : (hasG ? 1.0 : 0.0);
    const sShare = (hasG && hasS) ? 0.5 : (hasS ? 1.0 : 0.0);

    const gLeadership = Math.floor(combatLeadership * gShare);
    const sLeadership = Math.floor(combatLeadership * sShare);

    // --- Guardsmen ---
    if (hasG && gLeadership > 0) {
      const totalW   = weights.archer + weights.spear + (weights.rider * 2);
      const unitPerW = gLeadership / totalW;
      let archN  = Math.floor(unitPerW * weights.archer);
      let spearN = Math.floor(unitPerW * weights.spear);
      let riderN = Math.floor((unitPerW * weights.rider * 2) / 2);
      archN += gLeadership - (archN + spearN + (riderN * 2)); // rounding remainder → archers

      out += `\n--- Guardsmen (${gLeadership.toLocaleString()} leadership) ---\n`;
      out += `🏹 Archers  — ${archN.toLocaleString()} total\n`;
      out += tierLines(splitTroops(archN, tiersG, "G"), "G");
      out += `🗡️  Spearmen — ${spearN.toLocaleString()} total\n`;
      out += tierLines(splitTroops(spearN, tiersG, "G"), "G");
      out += `🐎 Riders   — ${riderN.toLocaleString()} total (×2 leadership)\n`;
      out += tierLines(splitTroops(riderN, tiersG, "G"), "G");
    }

    // --- Specialists ---
    if (hasS && sLeadership > 0) {
      const totalW   = weights.archer + weights.spear + (weights.rider * 2);
      const unitPerW = sLeadership / totalW;
      let archN  = Math.floor(unitPerW * weights.archer);
      let spearN = Math.floor(unitPerW * weights.spear);
      let riderN = Math.floor((unitPerW * weights.rider * 2) / 2);
      archN += sLeadership - (archN + spearN + (riderN * 2));

      out += `\n--- Specialists (${sLeadership.toLocaleString()} leadership) ---\n`;
      out += `🏹 Vultures/Deadshot (ranged) — ${archN.toLocaleString()} total\n`;
      out += tierLines(splitTroops(archN, tiersS, "S"), "S");
      out += `🗡️  Swordsmen (melee)          — ${spearN.toLocaleString()} total\n`;
      out += tierLines(splitTroops(spearN, tiersS, "S"), "S");
      out += `🐎 Lion Riders (cavalry)       — ${riderN.toLocaleString()} total (×2 leadership)\n`;
      out += tierLines(splitTroops(riderN, tiersS, "S"), "S");
    }

    // --- Engineering ---
    if (hasE && engReserve > 0) {
      out += `\n--- Engineering Corps (${engReserve.toLocaleString()} leadership reserved) ---\n`;
      out += `⚙️  Siege units — highest tier first\n`;
      out += tierLines(splitTroops(engReserve, tiersE, "E"), "E");
    }

    const totalUsed = (hasG ? gLeadership : 0) + (hasS ? sLeadership : 0) + (hasE ? engReserve : 0);
    out += `\nLeadership consumed: ${totalUsed.toLocaleString()} / ${leadership.toLocaleString()}\n`;
  }

  // ================================================================
  // POOL 2: DOMINANCE (Player Monsters)
  // ================================================================
  if (dominance > 0 && tiersM.length > 0) {
    out += `\n━━━ DOMINANCE POOL: ${dominance.toLocaleString()} ━━━━━━━━━━━━━━━━━━━━\n`;
    out += `Player Monsters — same march as Leadership troops.\n`;
    out += `\n🐲 PLAYER MONSTERS\n`;
    out += tierLines(splitTroops(dominance, tiersM, "M"), "M");
    out += `\nDominance consumed: ${dominance.toLocaleString()} / ${dominance.toLocaleString()}\n`;
    out += `(Adjust counts once per-monster dominance costs are mined from in-game.)\n`;
  }

  // ================================================================
  // POOL 3: AUTHORITY (Mercenaries)
  // ================================================================
  if (authority > 0 && tiersMerc.length > 0) {
    out += `\n━━━ AUTHORITY POOL: ${authority.toLocaleString()} ━━━━━━━━━━━━━━━━━━━━\n`;
    out += `Mercenaries — all unit classes, separate cap.\n`;
    out += `\n⚔️  MERCENARIES (tier equivalent)\n`;
    const mercResult = splitTroops(authority, tiersMerc, "T");
    Object.entries(mercResult).forEach(([k,v]) => {
      if(v > 0) out += `    Tier ~${k.replace("T","")}: ${v.toLocaleString()}\n`;
    });
    out += `\nAuthority consumed: ${authority.toLocaleString()} / ${authority.toLocaleString()}\n`;
    out += `(Adjust once per-merc authority costs are mined from in-game.)\n`;
  }

  document.getElementById("output").textContent = out;
}

// ---- Utility ----
function formatLabel(str) {
  if (!str) return "";
  return str.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ---- Init ----
window.addEventListener("DOMContentLoaded", loadData);
