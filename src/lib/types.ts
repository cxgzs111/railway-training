// ============================
// Types for Railway Training System
// ============================

export interface Violation {
  date: string;
  type: string;
  description: string;
  standard: string;
  level: string;
  penalty: string;
}

export interface ExamRecord {
  device: string;
  deviceRaw: string;
  taskName: string;
  score: number;
  scoreStr: string;
  result: string;
  date: string;
}

export interface Person {
  name: string;
  fleet: string;
  salaryNumber: string;
  violations: Violation[];
  exams: ExamRecord[];
}

export interface QuestionBank {
  headers: string[];
  rows: string[][];
}

export interface AnalysisResult {
  violationAnalysis: string;
  trainingAnalysis: string;
  riskAnalysis?: string;
  suggestions: { title: string; content: string }[];
}

export interface FormattedQuestion {
  questionText: string;
  options: string[];
  answer: string;
  category: string;
}

export interface MatchedQuestion {
  row: string[];
  relevance: number;
  category: string;
  headers: string[];
  questionText: string;
  questionType: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface Report {
  person: Person;
  analysis: AnalysisResult;
  questions: MatchedQuestion[];
}

export interface AIConfig {
  url: string;
  key: string;
  model: string;
  enabled: boolean;
}

export interface FieldDef {
  key: string;
  label: string;
  kw: string[];
}
