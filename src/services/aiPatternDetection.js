// ============================================================
// AI PATTERN DETECTION — Rule-Based ML Classifier
// Analyzes the knowledge graph to generate health scores,
// detect risk patterns, and produce personalized suggestions.
// ============================================================

import { NODE_TYPES, buildNodeWeights, traverseGraph } from './knowledgeGraphEngine';
import { RISK_LEVELS, SCORE_THRESHOLDS } from '../utils/constants';

// ────────────────────────────────────────────────────────────
// SECTION 1: SCORE CALCULATION
// ────────────────────────────────────────────────────────────

/**
 * Calculate BMI from Firestore profile (weight kg, height cm).
 * Returns null if data is missing or invalid.
 */
const calcBMI = (userProfile) => {
  const { weight, height, weightUnit, heightUnit } = userProfile || {};
  if (!weight || !height || height <= 0) return null;
  const weightKg = weightUnit === 'lbs' ? weight * 0.453592 : weight;
  const heightM  = heightUnit === 'in'  ? height * 0.0254   : height / 100;
  if (heightM <= 0) return null;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
};

/**
 * Calculate Physical Health Score (0–100) from node weights.
 * Optionally applies a BMI-based penalty when userProfile is provided.
 * Returns { score, breakdown } where breakdown is an array of per-factor objects.
 */
const calcPhysicalScore = (w, userProfile) => {
  const sleepHoursScore = w[NODE_TYPES.SLEEP_HOURS]   * 100;
  const sleepQualScore  = w[NODE_TYPES.SLEEP_QUALITY]  * 100;
  const exerciseScore   = w[NODE_TYPES.EXERCISE]        * 100;
  const waterScore      = w[NODE_TYPES.WATER]           * 100;
  const symptomPenalty  = w[NODE_TYPES.SYMPTOMS]        * 40;
  const caffeinepenalty = w[NODE_TYPES.CAFFEINE]        * 20;
  const alcoholPenalty  = w[NODE_TYPES.ALCOHOL]         * 25;

  const raw =
    sleepHoursScore          * 0.25 +
    sleepQualScore           * 0.20 +
    exerciseScore            * 0.20 +
    waterScore               * 0.15 +
    (100 - symptomPenalty)   * 0.20 -
    caffeinepenalty          * 0.10 -
    alcoholPenalty           * 0.10;

  let bmiPenalty = 0;
  const bmi = calcBMI(userProfile);
  if (bmi !== null) {
    if (bmi >= 30)       bmiPenalty = 10;
    else if (bmi >= 27)  bmiPenalty = 5;
    else if (bmi < 18.5) bmiPenalty = 5;
  }

  const score = Math.round(Math.max(0, Math.min(100, raw - bmiPenalty)));

  const breakdown = [
    {
      label:  'Sleep Duration',
      emoji:  '🛌',
      earned: Math.round(sleepHoursScore * 0.25),
      max:    25,
      note:   sleepHoursScore >= 62.5 ? '7+ hours — great for recovery'
              : sleepHoursScore < 50  ? 'Less than 6 hours of sleep'
              :                         'Around 6–7 hours',
    },
    {
      label:  'Sleep Quality',
      emoji:  '💤',
      earned: Math.round(sleepQualScore * 0.20),
      max:    20,
      note:   sleepQualScore >= 75 ? 'Good quality sleep'
              : sleepQualScore < 50 ? 'Poor sleep quality'
              :                       'Average sleep quality',
    },
    {
      label:  'Exercise',
      emoji:  '🏃',
      earned: Math.round(exerciseScore * 0.20),
      max:    20,
      note:   exerciseScore > 0 ? 'Active today' : 'No activity logged',
    },
    {
      label:  'Hydration',
      emoji:  '💧',
      earned: Math.round(waterScore * 0.15),
      max:    15,
      note:   waterScore >= 60 ? '6+ glasses logged'
              : waterScore < 40 ? 'Under 4 glasses today'
              :                   'Moderate water intake',
    },
    {
      label:  'Physical Health',
      emoji:  '🫀',
      earned: Math.round((100 - symptomPenalty) * 0.20),
      max:    20,
      note:   symptomPenalty < 20  ? 'Few or no symptoms today'
              : symptomPenalty > 60 ? 'Several symptoms reported'
              :                       'Some symptoms present',
    },
    ...(bmi !== null ? [{
      label:  'BMI',
      emoji:  '⚖️',
      earned: -bmiPenalty,
      max:    0,
      note:   bmi >= 30    ? `BMI ${bmi.toFixed(1)} — obese range`
              : bmi >= 27  ? `BMI ${bmi.toFixed(1)} — overweight`
              : bmi < 18.5 ? `BMI ${bmi.toFixed(1)} — underweight`
              :               `BMI ${bmi.toFixed(1)} — healthy range`,
    }] : []),
  ];

  return { score, breakdown };
};

/**
 * Calculate Mental Health Score (0–100) from node weights.
 * Note: higher stress/anxiety = worse, so we invert them.
 * Returns { score, breakdown } where breakdown is an array of per-factor objects.
 */
const calcMentalScore = (w) => {
  const moodScore         = w[NODE_TYPES.MOOD]          * 100;
  const stressPenalty     = w[NODE_TYPES.STRESS]        * 100;
  const anxietyPenalty    = w[NODE_TYPES.ANXIETY]       * 100;
  const lonelinessPenalty = w[NODE_TYPES.LONELINESS]    * 60;
  const motivationScore   = w[NODE_TYPES.MOTIVATION]    * 100;
  const sleepBonus        = w[NODE_TYPES.SLEEP_QUALITY] * 30;

  const moodEarned       = Math.round(moodScore * 0.30);
  const stressEarned     = Math.round((100 - stressPenalty) * 0.25);
  const anxietyEarned    = Math.round((100 - anxietyPenalty) * 0.20);
  const motivationEarned = Math.round(motivationScore * 0.15);
  const socialEarned     = Math.round((100 - lonelinessPenalty) * 0.10);

  const raw =
    moodScore              * 0.30 +
    (100 - stressPenalty)  * 0.25 +
    (100 - anxietyPenalty) * 0.20 +
    motivationScore        * 0.15 +
    (100 - lonelinessPenalty) * 0.10 +
    sleepBonus             * 0.05;

  const score = Math.round(Math.max(0, Math.min(100, raw)));

  const breakdown = [
    {
      label:  'Mood',
      emoji:  '😊',
      earned: moodEarned,
      max:    30,
      note:   moodScore >= 75 ? 'Positive mood today'
              : moodScore < 50 ? 'Low mood recorded'
              :                  'Neutral mood today',
    },
    {
      label:  'Stress Level',
      emoji:  '😤',
      earned: stressEarned,
      max:    25,
      note:   stressPenalty < 30 ? 'Low stress — well managed'
              : stressPenalty > 60 ? 'High stress today'
              :                      'Moderate stress level',
    },
    {
      label:  'Anxiety',
      emoji:  '😰',
      earned: anxietyEarned,
      max:    20,
      note:   anxietyPenalty < 30 ? 'Anxiety well under control'
              : anxietyPenalty > 60 ? 'High anxiety reported'
              :                       'Mild to moderate anxiety',
    },
    {
      label:  'Motivation',
      emoji:  '🎯',
      earned: motivationEarned,
      max:    15,
      note:   motivationScore >= 75 ? 'Feeling motivated today'
              : motivationScore < 40 ? 'Low motivation logged'
              :                        'Moderate motivation',
    },
    {
      label:  'Social Connection',
      emoji:  '👥',
      earned: socialEarned,
      max:    10,
      note:   lonelinessPenalty < 20 ? 'Feeling connected today'
              : lonelinessPenalty > 50 ? 'Feeling isolated today'
              :                          'Some feelings of loneliness',
    },
  ];

  return { score, breakdown };
};

/**
 * Calculate Diet & Lifestyle Score (0–100).
 */
const calcDietScore = (w) => {
  const mealScore        = w[NODE_TYPES.MEALS]         * 100;
  const eatingHabitScore = w[NODE_TYPES.EATING_HABITS] * 100;
  const caffeinepenalty  = w[NODE_TYPES.CAFFEINE]      * 50;
  const energyPenalty    = w[NODE_TYPES.ENERGY_DRINKS] * 40;
  const alcoholPenalty   = w[NODE_TYPES.ALCOHOL]       * 50;

  const raw =
    mealScore         * 0.30 +
    eatingHabitScore  * 0.25 +
    (100 - caffeinepenalty)  * 0.20 +
    (100 - energyPenalty)    * 0.15 +
    (100 - alcoholPenalty)   * 0.10;

  return Math.round(Math.max(0, Math.min(100, raw)));
};

/**
 * Compute all three health scores and the overall score.
 * Optionally accepts userProfile for BMI-aware physical score.
 */
export const calculateScores = (nodeWeights, userProfile) => {
  const physical    = calcPhysicalScore(nodeWeights, userProfile);
  const mental      = calcMentalScore(nodeWeights);
  const dietScore   = calcDietScore(nodeWeights);

  const physicalScore = physical.score;
  const mentalScore   = mental.score;
  const overallScore  = Math.round(
    physicalScore * 0.40 +
    mentalScore   * 0.40 +
    dietScore     * 0.20
  );

  return {
    overallScore,
    physicalScore,
    mentalScore,
    dietScore,
    physicalBreakdown: physical.breakdown,
    mentalBreakdown:   mental.breakdown,
  };
};

// ────────────────────────────────────────────────────────────
// SECTION 2: PATTERN RULES
// ────────────────────────────────────────────────────────────

/**
 * Each rule: { id, name, description, check(w) => bool, severity, category }
 * w = nodeWeights object (values 0–1)
 */
const PATTERN_RULES = [
  {
    id: 'burnout_risk',
    name: 'Burnout Risk Detected',
    description:
      'Poor sleep combined with high stress and skipped or low meals suggests early burnout. Your body and mind are running low on resources.',
    check: (w) =>
      w[NODE_TYPES.SLEEP_HOURS] < 0.5 &&
      w[NODE_TYPES.STRESS] > 0.6 &&
      w[NODE_TYPES.MEALS] < 0.5,
    severity: 'high',
    category: 'mental',
    scienceRef: 'Burnout is recognized by WHO as an occupational phenomenon linked to chronic workplace stress (WHO, 2019).',
  },
  {
    id: 'dehydration_pattern',
    name: 'Dehydration Pattern',
    description:
      'Low water intake combined with physical symptoms (such as headache or fatigue) points to dehydration. Aim for at least 8 glasses of water today.',
    check: (w) =>
      w[NODE_TYPES.WATER] < 0.4 &&
      w[NODE_TYPES.SYMPTOMS] > 0.3,
    severity: 'medium',
    category: 'physical',
    scienceRef: 'Mild dehydration of 1–2% body weight loss reduces concentration and mood (Journal of Nutrition, 2012).',
  },
  {
    id: 'caffeine_anxiety_loop',
    name: 'Caffeine-Anxiety Loop',
    description:
      'High caffeine intake is amplifying your anxiety. This creates a cycle: anxiety leads to more caffeine, which worsens anxiety and disrupts sleep.',
    check: (w) =>
      w[NODE_TYPES.CAFFEINE] > 0.5 &&
      w[NODE_TYPES.ANXIETY] > 0.5,
    severity: 'medium',
    category: 'mental',
    scienceRef: 'More than 400mg of caffeine daily can increase anxiety and disrupt sleep cycles (FDA).',
  },
  {
    id: 'sleep_deprivation',
    name: 'Sleep Deprivation',
    description:
      'You slept fewer than 6 hours with poor quality. Chronic sleep deprivation affects mood, cognition, immune function, and physical recovery.',
    check: (w) =>
      w[NODE_TYPES.SLEEP_HOURS] < 0.5 &&
      w[NODE_TYPES.SLEEP_QUALITY] < 0.5,
    severity: 'high',
    category: 'physical',
    scienceRef: 'Less than 6 hours of sleep impairs cognitive function equivalent to 2 days without sleep (Harvard Medical School).',
  },
  {
    id: 'high_stress_cluster',
    name: 'High Stress Cluster',
    description:
      'High stress, anxiety, and low motivation are appearing together. This cluster is associated with emotional exhaustion if sustained over multiple days.',
    check: (w) =>
      w[NODE_TYPES.STRESS] > 0.6 &&
      w[NODE_TYPES.ANXIETY] > 0.6 &&
      w[NODE_TYPES.MOTIVATION] < 0.4,
    severity: 'high',
    category: 'mental',
    scienceRef: 'Chronic stress elevates cortisol, linked to increased risk of anxiety and depression (APA, 2023).',
  },
  {
    id: 'physical_fatigue',
    name: 'Physical Fatigue Pattern',
    description:
      'No exercise combined with poor sleep and low motivation creates a physical fatigue cycle. Light movement can break this pattern.',
    check: (w) =>
      w[NODE_TYPES.EXERCISE] === 0 &&
      w[NODE_TYPES.SLEEP_QUALITY] < 0.5 &&
      w[NODE_TYPES.MOTIVATION] < 0.4,
    severity: 'medium',
    category: 'physical',
    scienceRef: 'Skipping meals and inactivity causes blood sugar crashes, increasing irritability and fatigue (Cleveland Clinic).',
  },
  {
    id: 'mood_low_pattern',
    name: 'Low Mood Pattern',
    description:
      'Your mood is low alongside feelings of loneliness and reduced motivation. Social connection and small positive activities can make a meaningful difference.',
    check: (w) =>
      w[NODE_TYPES.MOOD] < 0.4 &&
      w[NODE_TYPES.LONELINESS] > 0.5,
    severity: 'medium',
    category: 'mental',
    scienceRef: 'Physical activity increases serotonin and dopamine levels, improving mood within 5 minutes (Mayo Clinic).',
  },
  {
    id: 'alcohol_sleep_disruption',
    name: 'Alcohol-Sleep Disruption',
    description:
      'Alcohol intake is disrupting your sleep quality. While alcohol may help you fall asleep, it reduces restorative REM sleep significantly.',
    check: (w) =>
      w[NODE_TYPES.ALCOHOL] > 0.4 &&
      w[NODE_TYPES.SLEEP_QUALITY] < 0.5,
    severity: 'medium',
    category: 'physical',
    scienceRef: 'Even moderate alcohol consumption disrupts REM sleep and reduces sleep quality by 24% (Sleep Foundation).',
  },
  {
    id: 'energy_drink_overuse',
    name: 'Energy Drink Overuse',
    description:
      'High energy drink consumption combined with anxiety is a concerning pattern. Energy drinks contain high caffeine and sugar that spike and crash energy.',
    check: (w) =>
      w[NODE_TYPES.ENERGY_DRINKS] > 0.5 &&
      w[NODE_TYPES.ANXIETY] > 0.4,
    severity: 'high',
    category: 'diet',
    scienceRef: 'More than 400mg of caffeine daily can increase anxiety and disrupt sleep cycles (FDA).',
  },
  {
    id: 'optimal_wellness',
    name: 'Optimal Wellness',
    description:
      'Excellent indicators across sleep, mood, and physical activity. You are in a positive health state. Keep maintaining these habits.',
    check: (w) =>
      w[NODE_TYPES.SLEEP_HOURS] > 0.7 &&
      w[NODE_TYPES.MOOD] > 0.7 &&
      w[NODE_TYPES.EXERCISE] > 0.5 &&
      w[NODE_TYPES.STRESS] < 0.4,
    severity: 'low',
    category: 'general',
  },
  {
    id: 'nutritional_gap',
    name: 'Nutritional Gap',
    description:
      'Low meal count with poor eating habits may be creating a nutritional deficit, contributing to low energy and mood instability.',
    check: (w) =>
      w[NODE_TYPES.MEALS] < 0.4 &&
      w[NODE_TYPES.EATING_HABITS] < 0.4,
    severity: 'medium',
    category: 'diet',
    scienceRef: 'Diets low in nutrients are associated with 25–35% higher risk of depression (BMJ, 2017).',
  },
  // ── Single-factor patterns (medium threshold) ────────────────
  // These catch moderate issues that don't meet the stricter
  // multi-factor thresholds above, explaining Medium Risk scores.
  {
    id: 'elevated_stress',
    name: 'Elevated Stress',
    description:
      'Your stress is above normal. Sustained elevated stress gradually impacts sleep, digestion, immune function, and cardiovascular health.',
    check: (w) =>
      w[NODE_TYPES.STRESS] > 0.5 &&
      // skip if high_stress_cluster already fires
      !(w[NODE_TYPES.STRESS] > 0.6 && w[NODE_TYPES.ANXIETY] > 0.6 && w[NODE_TYPES.MOTIVATION] < 0.4),
    severity: 'medium',
    category: 'mental',
    scienceRef: 'Chronic stress elevates cortisol, linked to increased risk of anxiety and depression (APA, 2023).',
  },
  {
    id: 'below_optimal_sleep',
    name: 'Below-Optimal Sleep',
    description:
      'You are getting less than 7 hours of sleep. Most adults need 7–9 hours for full cognitive and physical recovery.',
    check: (w) =>
      w[NODE_TYPES.SLEEP_HOURS] < 0.625 && // (7h - 2) / (10 - 2) = 0.625
      // skip if sleep_deprivation already fires
      !(w[NODE_TYPES.SLEEP_HOURS] < 0.5 && w[NODE_TYPES.SLEEP_QUALITY] < 0.5),
    severity: 'medium',
    category: 'physical',
    scienceRef: 'Less than 6 hours of sleep impairs cognitive function equivalent to 2 days without sleep (Harvard Medical School).',
  },
  {
    id: 'sedentary_day',
    name: 'Sedentary Day',
    description:
      'No physical activity recorded today. Regular movement — even a 10-minute walk — improves mood, metabolism, and sleep quality.',
    check: (w) =>
      w[NODE_TYPES.EXERCISE] === 0 &&
      // skip if physical_fatigue already fires
      !(w[NODE_TYPES.SLEEP_QUALITY] < 0.5 && w[NODE_TYPES.MOTIVATION] < 0.4),
    severity: 'medium',
    category: 'physical',
    scienceRef: 'Even 10 minutes of movement reduces cardiovascular risk by 35% (WHO, 2020).',
  },
  {
    id: 'below_neutral_mood',
    name: 'Below-Neutral Mood',
    description:
      'Your mood is below neutral today. Mood is closely linked to sleep quality, physical activity, nutrition, and social connection.',
    check: (w) =>
      w[NODE_TYPES.MOOD] < 0.5 &&
      // skip if mood_low_pattern already fires
      !(w[NODE_TYPES.MOOD] < 0.4 && w[NODE_TYPES.LONELINESS] > 0.5),
    severity: 'medium',
    category: 'mental',
    scienceRef: 'Physical activity increases serotonin and dopamine levels, improving mood within 5 minutes (Mayo Clinic).',
  },
];

/**
 * Detect all triggered patterns from node weights.
 */
export const detectPatterns = (nodeWeights) => {
  return PATTERN_RULES.filter((rule) => rule.check(nodeWeights));
};

// ── Meal quality pattern (uses raw check-in data, not nodeWeights) ────────────
const PROCESSED_FOOD_KEYWORDS = [
  'sandwich', 'waffle', 'chips', 'instant', 'junk', 'fast food', 'soda',
  'burger', 'pizza', 'fries', 'nuggets', 'ramen', 'noodles', 'hotdog',
  'mcdonalds', 'kfc', 'takeaway', 'takeout', 'fried', 'biscuit', 'cookie',
];

/**
 * Detect meal quality concern from raw mealDetails array.
 * Fires when 2+ meals are Light/Snack type or contain processed food keywords.
 */
const detectMealQualityPattern = (checkIn) => {
  const mealDetails = checkIn?.mealDetails;
  if (!Array.isArray(mealDetails) || mealDetails.length < 2) return null;

  let concernCount = 0;
  for (const meal of mealDetails) {
    const isLightType = meal.type === 'Snack' || meal.type === 'Light';
    const desc = (meal.description || '').toLowerCase();
    const hasProcessedKeyword = PROCESSED_FOOD_KEYWORDS.some((kw) => desc.includes(kw));
    if (isLightType || hasProcessedKeyword) concernCount++;
  }

  if (concernCount >= 2) {
    return {
      id: 'meal_quality_concern',
      name: 'Meal Quality Concern',
      description:
        'Your meal log suggests mostly light or processed food today. Nutrition quality impacts mood, energy, and long-term health.',
      severity: 'medium',
      category: 'diet',
      scienceRef:
        'Ultra-processed foods are linked to a 32% higher risk of anxiety and depression (BMJ, 2023). Consider adding whole foods to your next meal.',
    };
  }
  return null;
};

/**
 * Detect a BMI-related pattern from the user's profile.
 * Requires weight (kg) and height (cm) saved during profile setup.
 */
const detectBMIPattern = (userProfile) => {
  const bmi = calcBMI(userProfile);
  if (bmi === null) return null;

  if (bmi >= 30) {
    return {
      id: 'bmi_obese',
      name: 'BMI in Obese Range',
      description: `Your BMI is ${bmi.toFixed(1)}, which is above 30. This is associated with increased risk for cardiovascular disease, type 2 diabetes, and joint strain. Sustainable changes to diet and daily movement can meaningfully reduce these risks over time.`,
      severity: 'medium',
      category: 'physical',
      scienceRef: 'A BMI of 30+ is linked to a 2–3× higher risk of type 2 diabetes and cardiovascular disease (WHO, 2020).',
    };
  }
  if (bmi >= 25) {
    return {
      id: 'bmi_overweight',
      name: 'BMI in Overweight Range',
      description: `Your BMI is ${bmi.toFixed(1)}, which is in the overweight range (25–29.9). Even a 5% reduction in body weight can noticeably improve energy levels and metabolic health.`,
      severity: 'low',
      category: 'physical',
      scienceRef: 'A 5% weight reduction in overweight individuals reduces key cardiovascular risk factors by 20–30% (NEJM, 2011).',
    };
  }
  if (bmi < 18.5) {
    return {
      id: 'bmi_underweight',
      name: 'BMI Below Healthy Range',
      description: `Your BMI is ${bmi.toFixed(1)}, which is below the healthy range (18.5–24.9). Low BMI can indicate insufficient nutrition and is associated with weakened immunity and reduced bone density.`,
      severity: 'medium',
      category: 'physical',
      scienceRef: 'Underweight individuals have a 1.8× higher all-cause mortality risk compared to healthy BMI (The Lancet, 2016).',
    };
  }
  return null;
};

// ────────────────────────────────────────────────────────────
// SECTION 2b: EMOTIONAL RISK DETECTION
// ────────────────────────────────────────────────────────────

const PULSE_SCORE_MAP = { Never: 0, Sometimes: 1, Often: 2, Always: 3 };

/**
 * Score Emotional Pulse responses and return a risk level.
 * reasonsToKeepGoing is reverse-scored (Always = 0, Never = 3).
 * Total 0 → "none", 1–3 → "low", 4–7 → "medium", 8–12 → "high".
 */
export const detectSelfHarmRisk = (everythingStop, betterWithout, feelEmpty, reasonsToKeepGoing) => {
  const s1 = PULSE_SCORE_MAP[everythingStop]           ?? 0;
  const s2 = PULSE_SCORE_MAP[betterWithout]            ?? 0;
  const s3 = PULSE_SCORE_MAP[feelEmpty]                ?? 0;
  const s4 = 3 - (PULSE_SCORE_MAP[reasonsToKeepGoing] ?? 0);
  const score = s1 + s2 + s3 + s4;

  const level = score === 0 ? 'none' : score <= 3 ? 'low' : score <= 7 ? 'medium' : 'high';
  console.log(
    `[detectSelfHarmRisk] inputs: { everythingStop: "${everythingStop}", betterWithout: "${betterWithout}", feelEmpty: "${feelEmpty}", reasonsToKeepGoing: "${reasonsToKeepGoing}" }` +
    ` | scores: [${s1}, ${s2}, ${s3}, ${s4}] | total: ${score} | level: "${level}"`
  );
  return level;
};

// ────────────────────────────────────────────────────────────
// SECTION 3: SUGGESTION GENERATOR
// ────────────────────────────────────────────────────────────

const SUGGESTION_LIBRARY = {
  sleep: [
    { id: 's1', title: 'Set a consistent bedtime', body: 'Going to bed and waking up at the same time every day regulates your circadian rhythm, improving sleep quality within days — consistent sleep timing improves total sleep time by up to 20% (Sleep Research Society, 2019).', icon: '🌙' },
    { id: 's2', title: 'Cut caffeine after 2 PM', body: 'Caffeine has a half-life of 5–6 hours. Avoiding it after 2 PM can significantly improve your ability to fall asleep — caffeine after 3 PM reduces total sleep time by 1 hour on average (Journal of Clinical Sleep Medicine).', icon: '☕' },
    { id: 's3', title: 'Wind-down routine', body: 'Spend 20–30 minutes before bed reading, stretching, or meditating instead of screens. This signals your brain that it is time to rest — screen-free wind-downs reduce time to fall asleep by 39% (American Academy of Pediatrics, 2019).', icon: '📖' },
  ],
  hydration: [
    { id: 'h1', title: 'Drink a glass now', body: 'Start with one full glass of water right now. Keep a water bottle visible on your desk as a constant reminder — even 1–2% dehydration reduces cognitive performance and mood (Journal of Nutrition, 2012).', icon: '💧' },
    { id: 'h2', title: 'Hydration schedule', body: 'Try the 8×8 rule: 8 glasses of 8 ounces per day. Set a phone reminder every 2 hours — consistent hydration reduces fatigue and headaches significantly (European Journal of Clinical Nutrition).', icon: '⏰' },
    { id: 'h3', title: 'Eat water-rich foods', body: 'Fruits like watermelon and cucumber contribute significantly to daily hydration needs alongside drinks.', icon: '🍉' },
  ],
  exercise: [
    { id: 'e1', title: 'Start with 10 minutes', body: 'A 10-minute walk raises endorphins and breaks the sedentary cycle. It is achievable even on low-motivation days — even brief exercise reduces fatigue by 65% (University of Georgia, 2008).', icon: '🚶' },
    { id: 'e2', title: 'Stretch at your desk', body: 'Simple desk stretches every hour reduce muscle tension and improve focus without needing gym equipment — regular stretching reduces muscle pain and tension by 30% (Journal of Sports Sciences).', icon: '🧘' },
    { id: 'e3', title: 'Movement snacks', body: 'Break exercise into 3 short 10-minute sessions instead of one 30-minute block if time is limited — short movement breaks improve focus and energy as effectively as one long session (British Journal of Sports Medicine).', icon: '🏃' },
  ],
  caffeine: [
    { id: 'c1', title: 'Reduce by one cup today', body: 'Slowly taper caffeine intake rather than stopping suddenly to avoid withdrawal headaches. Start by removing one cup — gradual reduction improves sleep quality within 3 days.', icon: '☕' },
    { id: 'c2', title: 'Replace with herbal tea', body: 'Green tea has lower caffeine with L-theanine, which promotes calm alertness without the anxiety spike — L-theanine reduces anxiety by 10–20 points on stress scales (Nutrition Reviews, 2019).', icon: '🍵' },
    { id: 'c3', title: 'Identify your triggers', body: 'Notice when you reach for caffeine most often. Often it is boredom or fatigue — both have better solutions.', icon: '🔍' },
  ],
  mental: [
    { id: 'm1', title: '4-7-8 breathing', body: 'Inhale for 4 seconds, hold for 7, exhale for 8. This activates your parasympathetic nervous system and reduces anxiety within minutes — the technique lowers heart rate by 8–10 bpm.', icon: '🫁' },
    { id: 'm2', title: 'Reach out to someone', body: 'Even a short text or call to a friend or family member can meaningfully reduce feelings of loneliness and stress — social connection is associated with a 50% longer lifespan (Holt-Lunstad, Brigham Young University, 2010).', icon: '💬' },
    { id: 'm3', title: 'Gratitude journaling', body: 'Writing three things you are grateful for each morning shifts focus from stressors to positives, reducing anxiety over time — gratitude practice reduces depression symptoms by 15% after 4 weeks (JMIR Mental Health, 2021).', icon: '📝' },
    { id: 'm4', title: 'Consider talking to a professional', body: 'If stress and anxiety persist, speaking with a therapist or counsellor can provide personalized coping strategies.', icon: '🧠' },
  ],
  nutrition: [
    { id: 'n1', title: 'Do not skip breakfast', body: 'Eating within 1–2 hours of waking stabilizes blood sugar, improving focus and mood throughout the morning — breakfast eaters show 40% higher concentration compared to skippers (Archives of Pediatrics, 2005).', icon: '🍳' },
    { id: 'n2', title: 'Prep healthy snacks', body: 'Keep easy-to-grab snacks like nuts, fruit, or yogurt available to prevent energy crashes between meals — planned snacking stabilizes blood glucose and reduces overeating at main meals.', icon: '🥜' },
    { id: 'n3', title: 'Reduce alcohol this week', body: 'Even a 2-day alcohol break can improve sleep quality, mood stability, and hydration levels noticeably — even brief abstinence improves REM sleep quality by 24% (Sleep Foundation).', icon: '🚫' },
  ],
};

/**
 * Select relevant suggestions based on detected patterns, node weights,
 * and optionally the user's profile (age, BMI).
 */
export const generateSuggestions = (patterns, nodeWeights, userProfile) => {
  const suggestions = [];
  const patternIds = patterns.map((p) => p.id);

  if (
    patternIds.includes('sleep_deprivation') ||
    patternIds.includes('burnout_risk') ||
    nodeWeights[NODE_TYPES.SLEEP_HOURS] < 0.5
  ) {
    suggestions.push(...SUGGESTION_LIBRARY.sleep.slice(0, 2));
  }

  if (
    patternIds.includes('dehydration_pattern') ||
    nodeWeights[NODE_TYPES.WATER] < 0.4
  ) {
    suggestions.push(...SUGGESTION_LIBRARY.hydration.slice(0, 2));
  }

  if (
    patternIds.includes('physical_fatigue') ||
    nodeWeights[NODE_TYPES.EXERCISE] === 0
  ) {
    suggestions.push(...SUGGESTION_LIBRARY.exercise.slice(0, 2));
  }

  if (
    patternIds.includes('caffeine_anxiety_loop') ||
    patternIds.includes('energy_drink_overuse') ||
    nodeWeights[NODE_TYPES.CAFFEINE] > 0.5
  ) {
    suggestions.push(...SUGGESTION_LIBRARY.caffeine.slice(0, 2));
  }

  if (
    patternIds.includes('high_stress_cluster') ||
    patternIds.includes('mood_low_pattern') ||
    patternIds.includes('burnout_risk')
  ) {
    suggestions.push(...SUGGESTION_LIBRARY.mental.slice(0, 2));
  }

  if (
    patternIds.includes('nutritional_gap') ||
    nodeWeights[NODE_TYPES.MEALS] < 0.4
  ) {
    suggestions.push(...SUGGESTION_LIBRARY.nutrition.slice(0, 2));
  }

  if (
    patternIds.includes('alcohol_sleep_disruption') ||
    nodeWeights[NODE_TYPES.ALCOHOL] > 0.4
  ) {
    suggestions.push(SUGGESTION_LIBRARY.nutrition[2]);
  }

  // BMI-aware suggestion
  const bmi = calcBMI(userProfile);
  if (bmi !== null && bmi >= 25) {
    suggestions.push({
      id: 'bmi_weight_goal',
      title: 'Work towards a healthy weight',
      body: `Your BMI is ${bmi.toFixed(1)}. Aiming to lose 0.5–1 kg per week through a modest caloric deficit and more daily movement is sustainable and evidence-backed. Small, consistent steps compound significantly over months.`,
      icon: '⚖️',
    });
  } else if (bmi !== null && bmi < 18.5) {
    suggestions.push({
      id: 'bmi_underweight_goal',
      title: 'Increase caloric and nutrient intake',
      body: `Your BMI is ${bmi.toFixed(1)}, which is below the healthy range. Focus on nutrient-dense foods — whole grains, lean proteins, healthy fats, and dairy — to build body weight and support immune function.`,
      icon: '🥗',
    });
  }

  // Deduplicate by id
  const seen = new Set();
  return suggestions.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
};

// ────────────────────────────────────────────────────────────
// SECTION 4: ALERT GENERATOR
// ────────────────────────────────────────────────────────────

/**
 * Generate alerts for patterns that warrant push notifications.
 */
export const generateAlerts = (patterns, scores) => {
  const alerts = [];

  const highPatterns = patterns.filter((p) => p.severity === 'high');
  highPatterns.forEach((p) => {
    alerts.push({
      id: `alert_${p.id}`,
      title: `⚠️ ${p.name}`,
      body: p.description,
      severity: 'high',
      patternId: p.id,
      timestamp: new Date().toISOString(),
    });
  });

  if (scores.overallScore < SCORE_THRESHOLDS.MEDIUM_RISK) {
    alerts.push({
      id: 'alert_overall_critical',
      title: '🚨 Critical Health Score',
      body: `Your overall health score is ${scores.overallScore}/100. Multiple risk factors are converging — please review your insights and take action today.`,
      severity: 'high',
      patternId: 'overall_critical',
      timestamp: new Date().toISOString(),
    });
  }

  // Deduplicate
  const seen = new Set();
  return alerts.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
};

// ────────────────────────────────────────────────────────────
// SECTION 5: RISK CLASSIFIER
// ────────────────────────────────────────────────────────────

/**
 * Classify overall risk level based on score and patterns.
 */
export const classifyRisk = (overallScore, patterns) => {
  const hasHighPattern = patterns.some((p) => p.severity === 'high');
  if (overallScore < SCORE_THRESHOLDS.MEDIUM_RISK || hasHighPattern) {
    return RISK_LEVELS.HIGH;
  }
  if (overallScore < SCORE_THRESHOLDS.LOW_RISK) {
    return RISK_LEVELS.MEDIUM;
  }
  return RISK_LEVELS.LOW;
};

// ────────────────────────────────────────────────────────────
// SECTION 6: RISK FACTOR BREAKDOWN
// ────────────────────────────────────────────────────────────

/**
 * Convert raw node weights into a ranked list of contributing factors.
 * Each factor has a 0–100 score (higher = better) and an impact level.
 * Only factors that meaningfully affect the score are included.
 */
export const generateRiskFactors = (nodeWeights) => {
  const w = nodeWeights;
  const factors = [];

  // Sleep hours — (7h - 2) / (10 - 2) = 0.625 is 7 h threshold
  const sleepHoursScore = Math.round(w[NODE_TYPES.SLEEP_HOURS] * 100);
  factors.push({
    id: 'sleep_hours',
    label: 'Sleep Duration',
    score: sleepHoursScore,
    impact: sleepHoursScore < 40 ? 'high' : sleepHoursScore < 63 ? 'medium' : 'low',
    icon: 'moon-outline',
    description: sleepHoursScore < 50
      ? 'Less than 6 hours of sleep is significantly impairing recovery and cognition.'
      : sleepHoursScore < 63
      ? 'Slightly below the 7–9 hour ideal. A little more sleep would lift your scores.'
      : 'Sleep duration is healthy — a positive contributor to your overall score.',
  });

  // Sleep quality
  const sleepQualScore = Math.round(w[NODE_TYPES.SLEEP_QUALITY] * 100);
  factors.push({
    id: 'sleep_quality',
    label: 'Sleep Quality',
    score: sleepQualScore,
    impact: sleepQualScore < 40 ? 'high' : sleepQualScore < 60 ? 'medium' : 'low',
    icon: 'bed-outline',
    description: sleepQualScore < 50
      ? 'Poor sleep quality prevents restorative rest even when hours are adequate.'
      : sleepQualScore < 60
      ? 'Fair sleep quality — a consistent wind-down routine can help.'
      : 'Sleep quality is contributing positively to your score.',
  });

  // Stress (inverted — lower stress = better score)
  const stressScore = Math.round((1 - w[NODE_TYPES.STRESS]) * 100);
  factors.push({
    id: 'stress',
    label: 'Stress Level',
    score: stressScore,
    impact: stressScore < 40 ? 'high' : stressScore < 55 ? 'medium' : 'low',
    icon: 'alert-circle-outline',
    description: stressScore < 40
      ? 'High stress is one of the biggest drags on your score today.'
      : stressScore < 55
      ? 'Moderate stress is affecting both your mental and physical indicators.'
      : 'Stress is well-managed — this supports your mental health score.',
  });

  // Anxiety (inverted)
  const anxietyScore = Math.round((1 - w[NODE_TYPES.ANXIETY]) * 100);
  if (anxietyScore < 65) {
    factors.push({
      id: 'anxiety',
      label: 'Anxiety',
      score: anxietyScore,
      impact: anxietyScore < 40 ? 'high' : 'medium',
      icon: 'pulse-outline',
      description: anxietyScore < 40
        ? 'High anxiety is significantly impacting your mental health score.'
        : 'Elevated anxiety is moderately pulling down your mental score.',
    });
  }

  // Mood
  const moodScore = Math.round(w[NODE_TYPES.MOOD] * 100);
  factors.push({
    id: 'mood',
    label: 'Mood',
    score: moodScore,
    impact: moodScore < 40 ? 'high' : moodScore < 52 ? 'medium' : 'low',
    icon: 'happy-outline',
    description: moodScore < 40
      ? 'Low mood is significantly affecting your mental health score.'
      : moodScore < 52
      ? 'Mood is slightly below neutral — check the Suggestions tab for quick wins.'
      : 'Good mood is a strong positive factor in your mental health score.',
  });

  // Exercise
  const exerciseScore = Math.round(w[NODE_TYPES.EXERCISE] * 100);
  factors.push({
    id: 'exercise',
    label: 'Physical Activity',
    score: exerciseScore,
    impact: exerciseScore === 0 ? 'medium' : 'low',
    icon: 'barbell-outline',
    description: exerciseScore === 0
      ? 'No exercise recorded today. Physical activity boosts mood, metabolism, and sleep quality.'
      : 'Physical activity is positively contributing to your health score.',
  });

  // Water
  const waterScore = Math.round(w[NODE_TYPES.WATER] * 100);
  factors.push({
    id: 'water',
    label: 'Hydration',
    score: waterScore,
    impact: waterScore < 35 ? 'medium' : 'low',
    icon: 'water-outline',
    description: waterScore < 35
      ? 'Low water intake can cause fatigue, headaches, and reduced focus.'
      : waterScore < 55
      ? 'Moderate hydration — aim for 8+ glasses to reach optimal levels.'
      : 'Good hydration is supporting your physical health score.',
  });

  // Caffeine (inverted, only shown when notable)
  const caffeineRaw = w[NODE_TYPES.CAFFEINE];
  if (caffeineRaw > 0.33) {
    const cafScore = Math.round((1 - caffeineRaw) * 100);
    factors.push({
      id: 'caffeine',
      label: 'Caffeine Intake',
      score: cafScore,
      impact: cafScore < 35 ? 'high' : 'medium',
      icon: 'cafe-outline',
      description: cafScore < 35
        ? 'High caffeine intake is linked to anxiety, disrupted sleep, and elevated heart rate.'
        : 'Moderate caffeine — avoid it after 2 PM to protect your sleep quality.',
    });
  }

  // Alcohol (inverted, only shown when notable)
  const alcoholRaw = w[NODE_TYPES.ALCOHOL];
  if (alcoholRaw > 0.2) {
    const alcScore = Math.round((1 - alcoholRaw) * 100);
    factors.push({
      id: 'alcohol',
      label: 'Alcohol',
      score: alcScore,
      impact: alcScore < 50 ? 'high' : 'medium',
      icon: 'wine-outline',
      description: alcScore < 50
        ? 'Significant alcohol intake is impacting sleep quality, mood, and recovery.'
        : 'Moderate alcohol recorded — has a mild negative effect on sleep and mood.',
    });
  }

  // Sort: high impact first, then medium, then low
  const order = { high: 0, medium: 1, low: 2 };
  return factors.sort((a, b) => order[a.impact] - order[b.impact]);
};

// ────────────────────────────────────────────────────────────
// SECTION 7: AI-POWERED PERSONALIZED RECOMMENDATIONS
// ────────────────────────────────────────────────────────────

/**
 * Call the Groq API (llama3-8b-8192) with the user's open-ended check-in
 * text and today's health scores. Returns 2-3 personalised recommendation
 * objects, or [] on any failure so the caller is never blocked.
 */
export const generatePersonalizedRecommendations = async (openEndedResponses, scores) => {
  console.log('[Groq] API key present:', !!process.env.EXPO_PUBLIC_GROQ_API_KEY);
  console.log('[Groq] key value:', process.env.EXPO_PUBLIC_GROQ_API_KEY?.slice(0, 10));
  console.log('[Groq] openEndedResponses:', JSON.stringify(openEndedResponses));
  try {
    const hasContent =
      openEndedResponses &&
      Object.values(openEndedResponses).some(
        (v) => typeof v === 'string' && v.trim().length > 0
      );
    if (!hasContent) return [];

    const apiKey = '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'; // TEMP: hardcoded for testing
    if (!apiKey) return [];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are a wellness advisor inside a health app called Mend. Give 2-3 short, warm, actionable wellness recommendations based on what the user shared. Be specific to their exact words — not generic. Keep each recommendation to 1-2 sentences. Respond in JSON only, no markdown: { "recommendations": [{ "title": "...", "body": "..." }] }',
          },
          {
            role: 'user',
            content:
              `What the user wrote:\n${Object.entries(openEndedResponses).map(([q, a]) => `- ${q}: "${a}"`).join('\n')}\n\n` +
              `Scores: Overall ${scores.overallScore}/100, Physical ${scores.physicalScore}/100, Mental ${scores.mentalScore}/100.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });
    console.log('[Groq] response status:', response.status);
    const data = await response.json();
    console.log('[Groq] raw data:', JSON.stringify(data).slice(0, 500));
    const text = data.choices?.[0]?.message?.content || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return parsed.recommendations || [];
  } catch {
    return [];
  }
};

// ────────────────────────────────────────────────────────────
// SECTION 7b: DAILY AI SUMMARY
// ────────────────────────────────────────────────────────────

export async function generateDailyAISummary(checkInData, scores, detectedPatterns) {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are a warm, supportive wellness advisor inside a health app called Mend.
Your job is to generate personalized, specific daily health commentary based on what the user logged today.
Never be generic. Always reference their specific data.
Respond in JSON only, no markdown.`,
          },
          {
            role: 'user',
            content: `Here is the user's check-in data for today:

SCORES:
- Overall: ${scores.overallScore}/100
- Physical: ${scores.physicalScore}/100
- Mental: ${scores.mentalScore}/100

PHYSICAL DATA:
- Sleep hours: ${checkInData.sleepHours}
- Sleep quality: ${checkInData.sleepQuality}
- Exercise minutes: ${checkInData.exerciseMinutes || 0}
- Hydration glasses: ${checkInData.hydrationGlasses || checkInData.waterIntake}
- Meal type: ${checkInData.mealType || checkInData.dietQuality}
- Meal details: ${checkInData.mealDetails || 'not specified'}
- Caffeine: ${checkInData.caffeineIntake || 'none'}
- Alcohol: ${checkInData.alcoholIntake || 'none'}

MENTAL DATA:
- Mood (1-5): ${checkInData.mood}
- Stress level (1-5): ${checkInData.stressLevel}
- Anxiety level: ${checkInData.anxietyLevel}

DETECTED PATTERNS: ${detectedPatterns.map((p) => p.name || p.pattern).join(', ')}

WHAT THE USER WROTE:
${checkInData.openEndedResponses ? Object.entries(checkInData.openEndedResponses).map(([q, a]) => `- ${q}: "${a}"`).join('\n') : 'Nothing written'}

Generate a JSON response with these exact keys:
{
  "dailySummary": "2-3 sentence personalized summary of how their day looks overall, referencing their specific numbers and what they wrote",
  "mealInsight": "1-2 sentences specifically about their meal choice and what it means for their energy and health today",
  "patternInsights": {
    "<pattern_name>": "1-2 sentence personalized explanation of this pattern specific to their data today"
  },
  "scoreInsight": "1 sentence explaining their specific score combination today in plain language"
}`,
          },
        ],
        temperature: 0.8,
        max_tokens: 800,
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('[DailyAI] error:', e);
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// SECTION 8: MAIN ANALYSIS ENTRY POINT
// ────────────────────────────────────────────────────────────

const OPEN_ENDED_LABELS = {
  onMind:       "What's been on your mind",
  struggling:   'Something specific they\'ve been struggling with',
  goodToday:    'Something that made them smile or feel good today',
  draining:     'What\'s been draining their energy',
  anythingElse: 'Anything else',
};

const buildOpenEndedContext = (responses) => {
  if (!responses || typeof responses !== 'object') return '';
  const lines = Object.entries(responses)
    .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
    .map(([k, v]) => `${OPEN_ENDED_LABELS[k] || k}: ${v.trim()}`);
  return lines.join('\n');
};

/**
 * Full analysis pipeline: checkIn data → complete insight report.
 * @param {object} checkIn - Raw check-in data from the user
 * @param {object} graph - Built knowledge graph
 * @param {object|null} userProfile - Firestore user profile (age, weight, height, displayName)
 * @returns {object} Complete analysis result
 */
export const analyzeHealthData = (checkIn, graph, userProfile = null) => {
  const nodeWeights      = graph.nodeWeights;
  const openEndedContext = buildOpenEndedContext(checkIn.openEndedResponses);

  const scores           = calculateScores(nodeWeights, userProfile);
  const basePatterns     = detectPatterns(nodeWeights);
  const mealPattern      = detectMealQualityPattern(checkIn);
  const bmiPattern       = detectBMIPattern(userProfile);
  const patterns         = [
    ...basePatterns,
    ...(mealPattern ? [mealPattern] : []),
    ...(bmiPattern  ? [bmiPattern]  : []),
  ];
  const riskLevel        = classifyRisk(scores.overallScore, patterns);
  const suggestions      = generateSuggestions(patterns, nodeWeights, userProfile);
  const alerts           = generateAlerts(patterns, scores);
  const selfHarmRisk     = detectSelfHarmRisk(
    checkIn.everythingStop,
    checkIn.betterWithout,
    checkIn.feelEmpty,
    checkIn.reasonsToKeepGoing,
  );

  return {
    ...scores,
    riskLevel,
    patterns: patterns.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      severity: p.severity,
      category: p.category,
      scienceRef: p.scienceRef || null,
    })),
    suggestions,
    alerts,
    selfHarmRisk,
    openEndedContext,
    // Persist nodeWeights so InsightsScreen can render the factor breakdown
    // without needing to re-fetch the raw health log.
    nodeWeights,
    analyzedAt: new Date().toISOString(),
  };
};
