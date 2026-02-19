function calculate() {
  let T = parseInt(document.getElementById("capacity").value);
  let minTier = parseInt(document.getElementById("minTier").value);
  let maxTier = parseInt(document.getElementById("maxTier").value);

  if (!T || T <= 0) {
    alert("Enter a valid march capacity.");
    return;
  }

  if (minTier > maxTier) {
    alert("Lowest tier cannot exceed highest tier.");
    return;
  }

  // ---- Step 1: Balanced troop weights ----
  // Archers weight = 1
  // Spears weight = 1
  // Riders weight = 2
  // Total weight split evenly into thirds

  let thirdWeight = T / 3;

  let archersTotal = Math.floor(thirdWeight); // weight = headcount
  let spearsTotal = Math.floor(thirdWeight);

  // Riders cost double weight
  let ridersTotal = Math.floor(thirdWeight / 2);

  // ---- Step 2: Build tier ratios ----
  // Tier pyramid uses doubling downward:
  // maxTier gets base 1
  // next gets 2
  // next gets 4, etc.

  let tiers = [];
  let ratioSum = 0;

  for (let tier = maxTier; tier >= minTier; tier--) {
    let power = maxTier - tier;
    let ratio = Math.pow(2, power);
    tiers.push({ tier: tier, ratio: ratio });
    ratioSum += ratio;
  }

  function splitTroops(total) {
    let results = {};
    let remaining = total;

    tiers.forEach((t, i) => {
      let count = Math.floor((total * t.ratio) / ratioSum);
      results["G" + t.tier] = count;
      remaining -= count;
    });

    // Put leftover troops into highest tier
    results["G" + maxTier] += remaining;
    return results;
  }

  let archers = splitTroops(archersTotal);
  let spears = splitTroops(spearsTotal);
  let riders = splitTroops(ridersTotal);

  // ---- Output ----
  let text = `=== March Capacity: ${T} ===\n`;
  text += `Tiers: G${minTier} → G${maxTier}\n\n`;

  text += `Archers Total: ${archersTotal}\n`;
  for (let key in archers) text += `  ${key}: ${archers[key]}\n`;

  text += `\nSpearmen Total: ${spearsTotal}\n`;
  for (let key in spears) text += `  ${key}: ${spears[key]}\n`;

  text += `\nRiders Total: ${ridersTotal} (double-weight)\n`;
  for (let key in riders) text += `  ${key}: ${riders[key]}\n`;

  document.getElementById("output").textContent = text;
}