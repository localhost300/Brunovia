export const recruitmentStages = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type RecruitmentStage = (typeof recruitmentStages)[number];

const transitions: Record<RecruitmentStage, RecruitmentStage[]> = {
  APPLIED: ["SCREENING", "REJECTED", "WITHDRAWN"],
  SCREENING: ["INTERVIEW", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["OFFER", "REJECTED", "WITHDRAWN"],
  OFFER: ["HIRED", "REJECTED", "WITHDRAWN"],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};
export function canMoveCandidate(from: RecruitmentStage, to: RecruitmentStage) {
  return transitions[from].includes(to);
}
export function averageInterviewScore(scores: number[]) {
  return scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
        100
    : null;
}
