// ============================================================
// KNOWLEDGE GRAPH ENGINE
// Stores health metrics as weighted nodes connected by edges.
// Traverses the graph to detect multi-factor health patterns.
// ============================================================

/**
 * Node types in the knowledge graph
 */
export const NODE_TYPES = {
  MOOD: 'mood',
  STRESS: 'stress',
  ANXIETY: 'anxiety',
  LONELINESS: 'loneliness',
  MOTIVATION: 'motivation',
  SLEEP_HOURS: 'sleep_hours',
  SLEEP_QUALITY: 'sleep_quality',
  EXERCISE: 'exercise',
  WATER: 'water',
  SYMPTOMS: 'symptoms',
  MEALS: 'meals',
  CAFFEINE: 'caffeine',
  ENERGY_DRINKS: 'energy_drinks',
  ALCOHOL: 'alcohol',
  EATING_HABITS: 'eating_habits',
};

/**
 * Predefined edge schema — connections between node types.
 * weight: 0.0–1.0 (strength of relationship)
 * polarity: 1 (positive/reinforcing) or -1 (negative/opposing)
 */
const EDGE_SCHEMA = [
  { from: NODE_TYPES.MOOD,         to: NODE_TYPES.STRESS,        weight: 0.9, polarity: -1 },
  { from: NODE_TYPES.MOOD,         to: NODE_TYPES.SLEEP_QUALITY,  weight: 0.8, polarity:  1 },
  { from: NODE_TYPES.MOOD,         to: NODE_TYPES.MOTIVATION,     weight: 0.8, polarity:  1 },
  { from: NODE_TYPES.MOOD,         to: NODE_TYPES.ANXIETY,        weight: 0.7, polarity: -1 },
  { from: NODE_TYPES.STRESS,       to: NODE_TYPES.ANXIETY,        weight: 0.9, polarity:  1 },
  { from: NODE_TYPES.STRESS,       to: NODE_TYPES.SLEEP_QUALITY,  weight: 0.7, polarity: -1 },
  { from: NODE_TYPES.STRESS,       to: NODE_TYPES.CAFFEINE,       weight: 0.6, polarity:  1 },
  { from: NODE_TYPES.SLEEP_HOURS,  to: NODE_TYPES.SLEEP_QUALITY,  weight: 0.9, polarity:  1 },
  { from: NODE_TYPES.SLEEP_HOURS,  to: NODE_TYPES.MOOD,           weight: 0.8, polarity:  1 },
  { from: NODE_TYPES.SLEEP_HOURS,  to: NODE_TYPES.CAFFEINE,       weight: 0.6, polarity: -1 },
  { from: NODE_TYPES.SLEEP_QUALITY,to: NODE_TYPES.MOTIVATION,     weight: 0.8, polarity:  1 },
  { from: NODE_TYPES.EXERCISE,     to: NODE_TYPES.MOOD,           weight: 0.7, polarity:  1 },
  { from: NODE_TYPES.EXERCISE,     to: NODE_TYPES.SLEEP_QUALITY,  weight: 0.6, polarity:  1 },
  { from: NODE_TYPES.EXERCISE,     to: NODE_TYPES.STRESS,         weight: 0.6, polarity: -1 },
  { from: NODE_TYPES.WATER,        to: NODE_TYPES.SYMPTOMS,       weight: 0.7, polarity: -1 },
  { from: NODE_TYPES.WATER,        to: NODE_TYPES.MOOD,           weight: 0.5, polarity:  1 },
  { from: NODE_TYPES.CAFFEINE,     to: NODE_TYPES.ANXIETY,        weight: 0.7, polarity:  1 },
  { from: NODE_TYPES.CAFFEINE,     to: NODE_TYPES.SLEEP_QUALITY,  weight: 0.8, polarity: -1 },
  { from: NODE_TYPES.CAFFEINE,     to: NODE_TYPES.SYMPTOMS,       weight: 0.5, polarity:  1 },
  { from: NODE_TYPES.ENERGY_DRINKS,to: NODE_TYPES.ANXIETY,        weight: 0.8, polarity:  1 },
  { from: NODE_TYPES.ENERGY_DRINKS,to: NODE_TYPES.SLEEP_QUALITY,  weight: 0.8, polarity: -1 },
  { from: NODE_TYPES.ALCOHOL,      to: NODE_TYPES.MOOD,           weight: 0.6, polarity: -1 },
  { from: NODE_TYPES.ALCOHOL,      to: NODE_TYPES.SLEEP_QUALITY,  weight: 0.7, polarity: -1 },
  { from: NODE_TYPES.ALCOHOL,      to: NODE_TYPES.ANXIETY,        weight: 0.5, polarity:  1 },
  { from: NODE_TYPES.MEALS,        to: NODE_TYPES.MOTIVATION,     weight: 0.6, polarity:  1 },
  { from: NODE_TYPES.MEALS,        to: NODE_TYPES.MOOD,           weight: 0.5, polarity:  1 },
  { from: NODE_TYPES.EATING_HABITS,to: NODE_TYPES.MOOD,           weight: 0.5, polarity:  1 },
  { from: NODE_TYPES.LONELINESS,   to: NODE_TYPES.MOOD,           weight: 0.7, polarity: -1 },
  { from: NODE_TYPES.LONELINESS,   to: NODE_TYPES.ANXIETY,        weight: 0.6, polarity:  1 },
];

/**
 * Normalize a raw value to 0–1 range.
 */
const normalize = (value, min, max) => {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
};

/**
 * Build normalized node weights from a check-in data object.
 * Returns: { nodeType: normalizedValue (0–1) }
 * Higher value always means "more of that thing" (e.g., high stress = 1).
 */
export const buildNodeWeights = (checkIn) => {
  const totalCaffeine = (checkIn.coffee || 0) + (checkIn.energyDrinks || 0) * 1.5;
  const hasSymptoms = (checkIn.symptoms || []).length > 0 ? 1 : 0;
  const symptomSeverity = Math.min((checkIn.symptoms || []).length / 4, 1);
  const skippedMeals = (checkIn.eatingHabits || []).includes('skipped') ? 0.2 : 0;
  const mealScore = normalize(checkIn.meals || 0, 0, 4);
  const adjustedMealScore = Math.max(0, mealScore - skippedMeals);

  return {
    [NODE_TYPES.MOOD]:          normalize(checkIn.mood || 3, 1, 5),
    [NODE_TYPES.STRESS]:        normalize(checkIn.stress || 3, 1, 5),
    [NODE_TYPES.ANXIETY]:       normalize(checkIn.anxiety || 3, 1, 5),
    [NODE_TYPES.LONELINESS]:    normalize(checkIn.loneliness || 3, 1, 5),
    [NODE_TYPES.MOTIVATION]:    normalize(checkIn.motivation || 3, 1, 5),
    [NODE_TYPES.SLEEP_HOURS]:   normalize(checkIn.sleep || 7, 2, 10),
    [NODE_TYPES.SLEEP_QUALITY]: normalize(checkIn.sleepQuality || 3, 1, 5),
    [NODE_TYPES.EXERCISE]:      checkIn.exercise === 'none' ? 0 : 1,
    [NODE_TYPES.WATER]:         normalize(checkIn.water || 4, 0, 10),
    [NODE_TYPES.SYMPTOMS]:      symptomSeverity,
    [NODE_TYPES.MEALS]:         adjustedMealScore,
    [NODE_TYPES.CAFFEINE]:      normalize(totalCaffeine, 0, 6),
    [NODE_TYPES.ENERGY_DRINKS]: normalize(checkIn.energyDrinks || 0, 0, 3),
    [NODE_TYPES.ALCOHOL]:       normalize(checkIn.alcohol || 0, 0, 5),
    [NODE_TYPES.EATING_HABITS]: (checkIn.eatingHabits || []).includes('healthy') ? 1
                                : (checkIn.eatingHabits || []).includes('junk') ? 0 : 0.5,
  };
};

/**
 * Build the full graph structure (nodes + edges) for a check-in.
 */
export const buildGraph = (checkIn, userId, date) => {
  const nodeWeights = buildNodeWeights(checkIn);

  const nodes = Object.entries(nodeWeights).map(([type, normalizedValue]) => ({
    id: type,
    type,
    normalizedValue,
    rawValue: checkIn[type] ?? null,
  }));

  const edges = EDGE_SCHEMA.map((schema, index) => ({
    id: `edge_${index}`,
    from: schema.from,
    to: schema.to,
    weight: schema.weight,
    polarity: schema.polarity,
    // Effective influence = weight × normalizedValue of source node
    effectiveInfluence: schema.weight * nodeWeights[schema.from],
  }));

  return {
    userId,
    date,
    nodes,
    edges,
    nodeWeights,
    lastUpdated: new Date().toISOString(),
  };
};

/**
 * Traverse the graph via BFS starting from a seed node.
 * Returns all node IDs reachable within `maxDepth` hops with
 * cumulative influence > threshold.
 */
export const traverseGraph = (graph, seedNodeId, maxDepth = 2, threshold = 0.3) => {
  const { edges, nodeWeights } = graph;
  const visited = new Set();
  const queue = [{ nodeId: seedNodeId, depth: 0, cumulativeInfluence: 1.0 }];
  const reachable = [];

  while (queue.length > 0) {
    const { nodeId, depth, cumulativeInfluence } = queue.shift();

    if (visited.has(nodeId) || depth > maxDepth) continue;
    visited.add(nodeId);

    if (nodeId !== seedNodeId) {
      reachable.push({ nodeId, depth, cumulativeInfluence });
    }

    if (depth < maxDepth) {
      const outEdges = edges.filter((e) => e.from === nodeId);
      for (const edge of outEdges) {
        const nextInfluence = cumulativeInfluence * edge.weight;
        if (nextInfluence >= threshold && !visited.has(edge.to)) {
          queue.push({
            nodeId: edge.to,
            depth: depth + 1,
            cumulativeInfluence: nextInfluence,
          });
        }
      }
    }
  }

  return reachable;
};

/**
 * Merge new graph data with existing historical graph.
 * Keeps the last 30 days of node/edge data.
 */
export const mergeGraphHistory = (existingGraph, newGraph) => {
  const history = existingGraph?.history || [];
  const trimmed = history.slice(-29); // keep last 29 + new = 30
  return {
    userId: newGraph.userId,
    current: newGraph,
    history: [...trimmed, newGraph],
    lastUpdated: newGraph.lastUpdated,
  };
};
