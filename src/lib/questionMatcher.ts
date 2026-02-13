import type { Person, QuestionBank, MatchedQuestion } from './types';

// ============================
// Question Bank Column Parser
// ============================
interface ParsedColumns {
  questionIdx: number;
  typeIdx: number;
  optionIdxs: { label: string; idx: number }[];
  answerIdx: number;
  explanationIdx: number;
}

function parseColumns(headers: string[]): ParsedColumns {
  const h = headers.map(s => (s || '').trim());
  const hl = h.map(s => s.toLowerCase());

  let questionIdx = hl.findIndex(s => s.includes('题目') || s.includes('题干') || s.includes('试题'));
  if (questionIdx < 0) questionIdx = 0;

  const typeIdx = hl.findIndex(s => s.includes('题型') || (s.includes('类型') && !s.includes('设备')));

  const optionIdxs: { label: string; idx: number }[] = [];
  h.forEach((s, i) => {
    const normalized = s.replace(/\s/g, '');
    if (/^[AaBb]$/.test(normalized) || /^选项[AaBbCcDdEe]$/i.test(normalized) || /^[AaBbCcDdEe]选项$/i.test(normalized)) {
      optionIdxs.push({ label: normalized.replace(/选项/gi, '').toUpperCase(), idx: i });
    } else if (/^[CcDdEe]$/.test(normalized)) {
      optionIdxs.push({ label: normalized.toUpperCase(), idx: i });
    }
  });
  optionIdxs.sort((a, b) => a.label.localeCompare(b.label));

  let answerIdx = hl.findIndex(s => s.includes('答案') || s.includes('正确'));
  let explanationIdx = hl.findIndex(s => s.includes('解析') || s.includes('说明') || s.includes('解释'));

  if (answerIdx < 0 && optionIdxs.length > 0) {
    answerIdx = optionIdxs[optionIdxs.length - 1].idx + 1;
  }
  if (answerIdx < 0) answerIdx = h.length >= 3 ? h.length - 2 : -1;
  if (explanationIdx < 0) explanationIdx = h.length >= 2 ? h.length - 1 : -1;

  return { questionIdx, typeIdx, optionIdxs, answerIdx, explanationIdx };
}

function parseQuestion(row: string[], cols: ParsedColumns): {
  questionText: string;
  questionType: string;
  options: string[];
  answer: string;
  explanation: string;
} {
  const questionText = (row[cols.questionIdx] || '').trim();
  const questionType = cols.typeIdx >= 0 ? (row[cols.typeIdx] || '').trim() : '';

  const options: string[] = [];
  if (cols.optionIdxs.length > 0) {
    cols.optionIdxs.forEach(o => {
      const val = (row[o.idx] || '').trim();
      if (val) {
        options.push(`${o.label}.${val}`);
      }
    });
  }

  const answer = cols.answerIdx >= 0 && cols.answerIdx < row.length ? (row[cols.answerIdx] || '').trim() : '';
  const explanation = cols.explanationIdx >= 0 && cols.explanationIdx < row.length ? (row[cols.explanationIdx] || '').trim() : '';

  return { questionText, questionType, options, answer, explanation };
}

// ============================
// N-gram generation for precise phrase matching
// ============================
function generateNgrams(text: string, minLen: number = 3, maxLen: number = 8): string[] {
  if (!text) return [];
  // Remove punctuation and whitespace
  const clean = text.replace(/[，,、。；;：:\s（）()\[\]【】""''《》\-\—\d\/\\]+/g, '');
  const ngrams: string[] = [];
  for (let len = minLen; len <= Math.min(maxLen, clean.length); len++) {
    for (let i = 0; i <= clean.length - len; i++) {
      ngrams.push(clean.substring(i, i + len));
    }
  }
  return ngrams;
}

// ============================
// Keyword Extraction (improved)
// ============================
const STOP_WORDS = new Set([
  '培训', '考试', '项目', '成绩', '机车', '司机', '人员', '设备', '装置',
  '乘务', '乘务员', '进行', '开展', '要求', '规定', '相关', '情况',
  '以下', '其中', '以及', '通过', '执行', '操作', '应当', '必须',
  '问题', '描述', '标准', '考核', '违反', '记录', '发生', '检查',
  '公司', '段', '车间', '班组', '负责', '管理', '按照', '根据',
  '当日', '当天', '发现', '进行', '未按', '应该', '不得',
]);

function extractKeywords(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[，,、。；;：:\s（）()\[\]【】""''《》\-\—\d\/\\]+/)
    .filter(w => w.length >= 2 && w.length <= 20 && !STOP_WORDS.has(w));
}

// Extract domain-specific terms from violation descriptions
function extractDomainTerms(text: string): string[] {
  if (!text) return [];
  const terms: string[] = [];
  // Match Chinese compound terms (3-8 chars) that are likely domain terms
  const patterns = [
    /[一二三四五六七八九十]+站[一二三四五六七八九十]*看[一二三四五六七八九十]*通过/g,
    /机班同行/g,
    /出退勤/g, /交接班/g, /走行路线/g,
    /运行揭示/g, /司机手册/g, /手册填记/g,
    /紧急制动/g, /制动力弱/g, /严重晃车/g, /轴温报警/g,
    /信号机/g, /进站信号/g, /出站信号/g,
    /折角塞门/g, /列尾装置/g,
    /非正常行车/g, /电话闭塞/g, /绿色许可证/g, /引导接车/g,
    /LKJ/g, /LSP/g, /GSM-R/g, /ATP/g,
    /人身安全/g, /劳动安全/g, /作业安全/g,
    /路票/g, /调车/g,
  ];
  patterns.forEach(pat => {
    const matches = text.match(pat);
    if (matches) terms.push(...matches);
  });

  // Also extract any 3-6 char segments that look like domain terms
  const segs = text.match(/[\u4e00-\u9fa5]{3,6}/g) || [];
  segs.forEach(seg => {
    if (!STOP_WORDS.has(seg) && seg.length >= 3) {
      terms.push(seg);
    }
  });

  return [...new Set(terms)];
}

/**
 * Improved question matching:
 * 1. N-gram phrase matching from violation descriptions & standards (highest weight)
 * 2. Domain-specific term matching (high weight)
 * 3. Weak exam topic keyword matching (high weight)
 * 4. General keyword matching (lower weight)
 */
export function matchQuestions(person: Person, banks: QuestionBank[]): MatchedQuestion[] {
  if (banks.length === 0) return [];

  // ===== Build matching data =====

  // Source 1: Violation descriptions and standards - HIGHEST priority
  const violationNgrams: Map<string, number> = new Map();
  const violationDomainTerms: Map<string, number> = new Map();

  person.violations.forEach(v => {
    // N-grams from description
    if (v.description) {
      generateNgrams(v.description, 3, 6).forEach(ng => {
        violationNgrams.set(ng, (violationNgrams.get(ng) || 0) + 5);
      });
      extractDomainTerms(v.description).forEach(t => {
        violationDomainTerms.set(t, (violationDomainTerms.get(t) || 0) + 6);
      });
    }
    // N-grams from standard
    if (v.standard) {
      generateNgrams(v.standard, 3, 6).forEach(ng => {
        violationNgrams.set(ng, (violationNgrams.get(ng) || 0) + 4);
      });
      extractDomainTerms(v.standard).forEach(t => {
        violationDomainTerms.set(t, (violationDomainTerms.get(t) || 0) + 5);
      });
    }
    // Type keywords
    if (v.type) {
      extractKeywords(v.type).forEach(w => {
        violationDomainTerms.set(w, (violationDomainTerms.get(w) || 0) + 4);
      });
    }
  });

  // Source 2: Weak exam items (score < 80) - HIGH priority
  const weakExamTerms: Map<string, number> = new Map();
  person.exams.filter(e => e.score < 80).forEach(e => {
    const taskName = e.taskName || e.deviceRaw || '';
    if (taskName) {
      // Full task name as search phrase
      generateNgrams(taskName, 3, 8).forEach(ng => {
        weakExamTerms.set(ng, (weakExamTerms.get(ng) || 0) + 4);
      });
      extractKeywords(taskName).forEach(w => {
        weakExamTerms.set(w, (weakExamTerms.get(w) || 0) + 3);
      });
      extractDomainTerms(taskName).forEach(t => {
        weakExamTerms.set(t, (weakExamTerms.get(t) || 0) + 4);
      });
    }
  });

  // Source 3: Passing exams - LOW priority
  const passingExamKw: Map<string, number> = new Map();
  person.exams.filter(e => e.score >= 80).forEach(e => {
    if (e.taskName) {
      extractKeywords(e.taskName).forEach(w => {
        passingExamKw.set(w, Math.max(passingExamKw.get(w) || 0, 1));
      });
    }
  });

  // Check if we have any matching data at all
  if (violationNgrams.size === 0 && violationDomainTerms.size === 0 &&
      weakExamTerms.size === 0 && passingExamKw.size === 0) {
    return [];
  }

  // ===== Score each question =====
  const results: MatchedQuestion[] = [];

  banks.forEach((bank, bankIdx) => {
    const cols = parseColumns(bank.headers);

    bank.rows.forEach(row => {
      const parsed = parseQuestion(row, cols);
      if (!parsed.questionText.trim()) return;

      const fullText = [parsed.questionText, ...parsed.options, parsed.explanation].join('');
      // Also clean version for n-gram matching
      const cleanText = fullText.replace(/[，,、。；;：:\s（）()\[\]【】""''《》\-\—\/\\]+/g, '');

      let score = 0;
      let matchedSources = 0; // Track diversity of matches

      // Match violation n-grams (highest priority)
      let violationNgramHits = 0;
      violationNgrams.forEach((weight, ng) => {
        if (cleanText.includes(ng)) {
          score += weight;
          violationNgramHits++;
        }
      });
      if (violationNgramHits > 0) matchedSources++;

      // Match violation domain terms
      let domainHits = 0;
      violationDomainTerms.forEach((weight, term) => {
        if (fullText.includes(term)) {
          score += weight;
          domainHits++;
        }
      });
      if (domainHits > 0) matchedSources++;

      // Match weak exam terms
      let weakExamHits = 0;
      weakExamTerms.forEach((weight, term) => {
        if (cleanText.includes(term) || fullText.includes(term)) {
          score += weight;
          weakExamHits++;
        }
      });
      if (weakExamHits > 0) matchedSources++;

      // Match passing exam keywords (low weight)
      passingExamKw.forEach((weight, kw) => {
        if (fullText.includes(kw)) {
          score += weight;
        }
      });

      // Bonus for matching multiple sources (violation + exam)
      if (matchedSources >= 2) score *= 1.3;

      // Minimum threshold: must have meaningful match
      if (score >= 8) {
        results.push({
          row,
          relevance: Math.round(score),
          category: `题库${bankIdx + 1}`,
          headers: bank.headers,
          questionText: parsed.questionText,
          questionType: parsed.questionType,
          options: parsed.options,
          answer: parsed.answer,
          explanation: parsed.explanation,
        });
      }
    });
  });

  // Deduplicate by question text
  const seen = new Set<string>();
  const unique = results.filter(q => {
    const key = q.questionText.substring(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => b.relevance - a.relevance);

  // Return 5-10 questions
  if (unique.length <= 5) return unique;
  return unique.slice(0, 10);
}
