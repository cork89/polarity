import { reddit } from "@devvit/web/server";
import type { GameMode, Level, PublishLevelResult } from "./shared";
import type { JSONObject } from "@devvit/public-api";

const defaultLevelData: Level = {
  name: "Default",
  gameMode: "timeAttack",
  baseGrid: [
    [" ", " ", " ", " ", " ", "R"],
    [" ", " ", " ", " ", " ", " "],
    [" ", " ", " ", " ", " ", " "],
    [" ", " ", "B", "P", " ", " "],
    [" ", " ", " ", " ", " ", " "],
    [" ", " ", " ", " ", " ", " "],
  ],
  stages: [],
  target: 200,
};

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: "Polarity Penguin [Time Attack]",
    postData: {
      type: "polarity_level",
      level: JSON.parse(JSON.stringify(defaultLevelData)) as JSONObject,
    } as JSONObject,
  });
};

const gameModeMap: Record<GameMode, string> = {
  timeAttack: "Time Attack",
  sprint: "Sprint",
  staged: "Staged",
};

export const publishLevel = async (
  level: Level,
): Promise<PublishLevelResult> => {
  try {
    const post = await reddit.submitCustomPost({
      title: `${getRandomPenguinAdjective()} Penguin [${
        gameModeMap[level.gameMode]
      }]`,
      postData: {
        type: "polarity_level",
        level: JSON.parse(JSON.stringify(level)) as JSONObject,
      } as JSONObject,
    });

    return {
      success: true,
      postId: post.id,
    };
  } catch (error) {
    console.error(`Error publishing level: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to publish level",
    };
  }
};

const penguinAdjectives = [
  "Palatable",
  "Palatial",
  "Party",
  "Passionate",
  "Passive",
  "Patient",
  "Patriotic",
  "Peaceable",
  "Peaceful",
  "Peerless",
  "Perceptive",
  "Perfect",
  "Perfumed",
  "Perky",
  "Permanent",
  "Permissible",
  "Permissive",
  "Perpetual",
  "Persevering",
  "Persistent",
  "Personable",
  "Persuasive",
  "Pertinent",
  "Petite",
  "Phenomenal",
  "Philanthropic",
  "Philosophical",
  "Photographic",
  "Picturesque",
  "Pious",
  "Piquant",
  "Pivotal",
  "Placid",
  "Planner",
  "Platonic",
  "Plausible",
  "Playful",
  "Pleasant",
  "Pleased",
  "Pleasing",
  "Plentiful",
  "Pliable",
  "Plucky",
  "Plushy",
  "Poetic",
  "Poised",
  "Polished",
  "Polite",
  "Popular",
  "Positive",
  "Possible",
  "Potent",
  "Potential",
  "Powerful",
  "Practical",
  "Pragmatic",
  "Praiseworthy",
  "Precious",
  "Precise",
  "Precocious",
  "Predictable",
  "Predominant",
  "Preeminent",
  "Preemptive",
  "Preferable",
  "Preferential",
  "Premium",
  "Prepared",
  "Present",
  "Presentable",
  "Prestigious",
  "Pretty",
  "Prevalent",
  "Priceless",
  "Primary",
  "Princely",
  "Principal",
  "Principled",
  "Pristine",
  "Prized",
  "Proactive",
  "Productive",
  "Professional",
  "Proficient",
  "Profitable",
  "Profound",
  "Profuse",
  "Progressive",
  "Prolific",
  "Prominent",
  "Promised",
  "Promising",
  "Pronounced",
  "Proper",
  "Propitious",
  "Prospective",
  "Prosperous",
  "Protective",
  "Proud",
  "Proverbial",
  "Prudent",
  "Prudential",
  "Pumped",
  "Punctual",
  "Pure",
  "Purposeful",
];

export const getRandomPenguinAdjective = (): string => {
  const randomIndex = Math.floor(Math.random() * penguinAdjectives.length);
  return penguinAdjectives[randomIndex]!;
};
