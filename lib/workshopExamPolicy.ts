/** Exam retry policy — client-safe (no fs). Go/Build only. */
export const WORKSHOP_EXAM_MAX_RETRIES = 1;

export type ExamDecision = "pass" | "retry" | "stop";

/** failsSoFar = exam failures already counted this Go (0 before first exam). */
export function workshopExamDecision(examOk: boolean, failsSoFar: number): ExamDecision {
  if (examOk) return "pass";
  if (failsSoFar < WORKSHOP_EXAM_MAX_RETRIES) return "retry";
  return "stop";
}
