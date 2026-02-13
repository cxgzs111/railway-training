import React, { useState, useRef, useCallback } from 'react';
import { readExcelFile, readQuestionBankFile, parseData } from './lib/excelParser';
import { localAnalysis } from './lib/analysis';
import { downloadWordReport, downloadAllReports } from './lib/wordGenerator';
import { matchQuestions } from './lib/questionMatcher';
import { exportSummaryTable } from './lib/summaryExport';
import { generateAIRiskAndSuggestions, generateAIBatch } from './lib/aiService';
import type { Person, QuestionBank, Report, AnalysisResult } from './lib/types';

interface Toast { id: number; message: string; type: 'success' | 'error' | 'info' | 'warning'; }
const TOAST_BG: Record<string, string> = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-railway-700', warning: 'bg-yellow-600' };

interface BatchProgress { total: number; completed: number; currentGroup: string; failed: number; }

export default function App() {
  const [violationData, setViolationData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [examData, setExamData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [violationFileName, setViolationFileName] = useState('');
  const [examFileName, setExamFileName] = useState('');
  const [questionFileNames, setQuestionFileNames] = useState<string[]>([]);

  const [persons, setPersons] = useState<Person[]>([]);
  const [departments, setDepartments] = useState<Record<string, Person[]>>({});
  const [isParsed, setIsParsed] = useState(false);

  const [reports, setReports] = useState<Map<string, Report>>(new Map());
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [currentReport, setCurrentReport] = useState<Report | null>(null);

  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const violationInputRef = useRef<HTMLInputElement>(null);
  const examInputRef = useRef<HTMLInputElement>(null);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const toastIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const handleFileUpload = (kind: 'violation' | 'exam' | 'question', e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (kind === 'question') {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const bank = readQuestionBankFile(ev.target!.result as ArrayBuffer);
            if (bank) { setQuestionBanks(prev => [...prev, bank]); setQuestionFileNames(prev => [...prev, file.name]); addToast(`题库 "${file.name}" 上传成功`, 'success'); }
          } catch { addToast(`题库 "${file.name}" 解析失败`, 'error'); }
        };
        reader.readAsArrayBuffer(file);
      });
      return;
    }
    const file = files[0];
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const result = readExcelFile(ev.target!.result as ArrayBuffer);
        if (kind === 'violation') { setViolationData(result); setViolationFileName(file.name); addToast(`两违表上传成功，共 ${result.rows.length} 行数据`, 'success'); }
        else { setExamData(result); setExamFileName(file.name); addToast(`实训表上传成功，共 ${result.rows.length} 行数据`, 'success'); }
      } catch { addToast(`${kind === 'violation' ? '两违表' : '实训表'}解析失败`, 'error'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleParse = () => {
    if (!violationData && !examData) { addToast('请至少上传一个数据文件', 'warning'); return; }
    setLoading(true);
    setTimeout(() => {
      try {
        const { persons: p } = parseData(
          violationData?.headers || [], violationData?.rows || [],
          examData?.headers || [], examData?.rows || []
        );
        if (p.length === 0) { addToast('未解析到有效数据，请检查表格格式', 'error'); }
        else {
          const uniqueKey = (p2: Person) => `${p2.name}__${p2.fleet}`;
          const seen = new Set<string>();
          const deduped: Person[] = [];
          p.forEach(person => {
            const key = uniqueKey(person);
            if (!seen.has(key)) { seen.add(key); deduped.push(person); }
          });
          setPersons(deduped);
          const deptMap: Record<string, Person[]> = {};
          deduped.forEach(person => {
            const dept = person.fleet || '未分类';
            if (!deptMap[dept]) deptMap[dept] = [];
            deptMap[dept].push(person);
          });
          setDepartments(deptMap);
          setIsParsed(true);
          setReports(new Map()); setCurrentReport(null); setSelectedPerson(null); setExpandedDept(null);
          const vDeptSet = new Set<string>();
          deduped.forEach(pp => { if (pp.violations.length > 0) vDeptSet.add(pp.fleet || '未分类'); });
          addToast(`解析成功！共 ${deduped.length} 人，${vDeptSet.size} 个两违责任人部门`, 'success');
        }
      } catch (err) { console.error(err); addToast('数据解析失败', 'error'); }
      setLoading(false);
    }, 200);
  };

  const generateReport = async (person: Person): Promise<Report> => {
    const analysis = localAnalysis(person);
    const questions = matchQuestions(person, questionBanks);

    if (aiEnabled) {
      try {
        const aiResult = await generateAIRiskAndSuggestions(person, analysis);
        if (aiResult.riskAnalysis) analysis.riskAnalysis = aiResult.riskAnalysis;
        if (aiResult.suggestions.length > 0) analysis.suggestions = aiResult.suggestions;
      } catch (err) {
        console.error('AI generation failed:', err);
      }
    }

    return { person, analysis, questions };
  };

  const handleSelectPerson = async (person: Person) => {
    setSelectedPerson(person);
    const key = `${person.name}__${person.fleet}`;
    const existing = reports.get(key);
    if (existing) { setCurrentReport(existing); return; }

    if (aiEnabled) setAiLoading(true);
    try {
      const report = await generateReport(person);
      setReports(prev => new Map(prev).set(key, report));
      setCurrentReport(report);
      if (aiEnabled) addToast(`${person.name} 报告已通过AI生成`, 'success');
    } catch (err) {
      console.error(err);
      addToast('报告生成失败', 'error');
    }
    if (aiEnabled) setAiLoading(false);
  };

  const handleGenerateAll = async () => {
    if (persons.length === 0) return;
    setLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Step 1: Generate all local analyses + questions (batch async to avoid blocking UI)
      const localResults: Map<string, { analysis: AnalysisResult; questions: Report['questions'] }> = new Map();
      setBatchProgress({ total: persons.length, completed: 0, currentGroup: '正在准备数据…', failed: 0 });
      setAiLoading(true);
      const BATCH_SIZE = 20;
      for (let i = 0; i < persons.length; i++) {
        if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const p = persons[i];
        const analysis = localAnalysis(p);
        const questions = matchQuestions(p, questionBanks);
        localResults.set(`${p.name}__${p.fleet}`, { analysis, questions });
        if ((i + 1) % BATCH_SIZE === 0 || i === persons.length - 1) {
          setBatchProgress({ total: persons.length, completed: 0, currentGroup: `正在准备数据 ${i + 1}/${persons.length}`, failed: 0 });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Step 2: If AI enabled, batch generate risk/suggestions with grouping + concurrency
      if (aiEnabled) {
        const pairs = persons.map(p => ({
          person: p,
          analysis: localResults.get(`${p.name}__${p.fleet}`)!.analysis,
        }));

        const aiResults = await generateAIBatch(
          pairs,
          (progress) => setBatchProgress({
            total: persons.length,
            completed: progress.completed,
            currentGroup: progress.currentGroup,
            failed: progress.failed,
          }),
          5, // concurrency
          abortController.signal
        );

        // Merge AI results into local analyses
        aiResults.forEach((aiResult, key) => {
          const local = localResults.get(key);
          if (local) {
            if (aiResult.riskAnalysis) local.analysis.riskAnalysis = aiResult.riskAnalysis;
            if (aiResult.suggestions.length > 0) local.analysis.suggestions = aiResult.suggestions;
          }
        });

      }

      // Step 3: Build final reports map
      const m = new Map<string, Report>();
      persons.forEach(p => {
        const key = `${p.name}__${p.fleet}`;
        const local = localResults.get(key)!;
        m.set(key, { person: p, analysis: local.analysis, questions: local.questions });
      });
      setReports(m);
      addToast(`已批量生成 ${persons.length} 份报告${aiEnabled ? '（AI辅助）' : ''}`, 'success');
    } catch (err) {
      if (abortController.signal.aborted) {
        addToast('批量生成已取消', 'warning');
      } else {
        console.error(err);
        addToast('批量生成失败', 'error');
      }
    }

    setLoading(false);
    setAiLoading(false);
    setBatchProgress(null);
    abortControllerRef.current = null;
  };

  const handleCancelBatch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addToast('正在取消…', 'warning');
    }
  };

  const handleDownloadCurrent = () => { if (!currentReport) return; downloadWordReport(currentReport); addToast(`${currentReport.person.name} 报告已下载`, 'success'); };
  const handleDownloadAll = () => { if (reports.size === 0) { addToast('请先生成报告', 'warning'); return; } downloadAllReports(Array.from(reports.values())); addToast(`正在批量下载 ${reports.size} 份报告…`, 'info'); };
  const handleExportSummary = () => { if (reports.size === 0) { addToast('请先生成报告', 'warning'); return; } exportSummaryTable(Array.from(reports.values())); addToast('汇总表(Excel)已导出', 'success'); };

  const totalViolations = persons.reduce((s, p) => s + p.violations.length, 0);
  const totalExams = persons.reduce((s, p) => s + p.exams.length, 0);
  const deptNames = Object.keys(departments).sort();

  const violationDeptSet = new Set<string>();
  persons.forEach(p => { if (p.violations.length > 0) violationDeptSet.add(p.fleet || '未分类'); });
  const violationDeptCount = violationDeptSet.size;

  const filteredDepts = searchTerm
    ? deptNames.filter(d => departments[d].some(p => p.name.includes(searchTerm)))
    : deptNames;

  const progressPercent = batchProgress ? Math.round((batchProgress.completed / Math.max(batchProgress.total, 1)) * 100) : 0;

  return (
    <div className="min-h-screen bg-steel-50 font-yahei">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`toast-enter pointer-events-auto px-5 py-3 rounded-lg shadow-xl text-white text-sm font-medium ${TOAST_BG[t.type]}`}>{t.message}</div>
        ))}
      </div>

      {/* AI Loading Overlay with Progress */}
      {aiLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-8 shadow-2xl flex flex-col items-center gap-4 w-[420px] max-w-[90vw]">
            <div className="loading-spinner !w-12 !h-12" />
            <p className="text-railway-700 font-bold text-lg">
              {batchProgress?.currentGroup?.includes('本地分析') ? '正在分析数据' : 'AI正在生成分析报告'}
            </p>
            {batchProgress ? (
              <>
                {/* Progress bar */}
                <div className="w-full bg-steel-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-railway-600 to-railway-700 h-full rounded-full transition-all duration-500 ease-out flex items-center justify-center"
                    style={{ width: `${progressPercent}%` }}
                  >
                    {progressPercent > 15 && (
                      <span className="text-white text-[10px] font-bold">{progressPercent}%</span>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-steel-700 text-sm font-medium">
                    {batchProgress.completed} / {batchProgress.total} 人已完成
                  </p>
                  <p className="text-steel-400 text-xs mt-1">{batchProgress.currentGroup}</p>

                </div>
                <p className="text-steel-400 text-xs">
                  {batchProgress?.currentGroup?.includes('本地分析')
                    ? '正在对每位人员进行数据分析和题目匹配…'
                    : '按违章类型智能分组，相同类型共用一次AI调用，大幅提升速度'}
                </p>
                <button
                  className="mt-2 px-4 py-1.5 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50 transition-colors"
                  onClick={handleCancelBatch}
                >
                  取消生成
                </button>
              </>
            ) : (
              <p className="text-steel-500 text-sm">调用Kimi AI接口，请稍候</p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative overflow-hidden">
        <div className="h-56 md:h-64 bg-gradient-to-br from-railway-900 via-railway-700 to-railway-600">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 left-10 w-40 h-40 rounded-full bg-white/20 blur-3xl" />
            <div className="absolute bottom-5 right-20 w-60 h-60 rounded-full bg-white/10 blur-3xl" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="relative h-full flex items-center justify-center px-4">
            <div className="text-center text-white animate-fade-in">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">🚄</div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-wider">机务段个人定向培训建议生成系统</h1>
              </div>
              <p className="text-base md:text-lg text-white/75 tracking-wide">两违分析 · 实训评估 · 智能建议 · 一键导出</p>
            </div>
          </div>
        </div>
      </header>

      {/* Steps */}
      <div className="bg-white border-b border-steel-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-0">
            {[
              { n: '1', label: '上传数据', done: !!(violationData || examData) },
              { n: '2', label: '解析分析', done: isParsed },
              { n: '3', label: '导出报告', done: reports.size > 0 },
            ].map((step, i) => (
              <React.Fragment key={step.n}>
                {i > 0 && <div className={`h-0.5 w-12 md:w-20 transition-colors ${step.done ? 'bg-railway-700' : 'bg-steel-200'}`} />}
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step.done ? 'bg-railway-700 text-white' : 'bg-steel-200 text-steel-400'}`}>{step.done ? '✓' : step.n}</div>
                  <span className={`text-sm font-medium hidden sm:inline ${step.done ? 'text-railway-700' : 'text-steel-400'}`}>{step.label}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Upload */}
        <section className="section-enter">
          <h2 className="text-xl font-bold text-railway-700 mb-5 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            第一步：上传数据文件
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            <div className={`upload-zone glass-card rounded-xl border-2 border-dashed p-6 text-center cursor-pointer ${violationData ? 'uploaded' : 'border-steel-300'}`} onClick={() => violationInputRef.current?.click()}>
              <input ref={violationInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFileUpload('violation', e)} />
              <div className="text-4xl mb-3">{violationData ? '✅' : '📋'}</div>
              <h3 className="font-bold text-railway-700 mb-1">两违记录表</h3>
              <p className="text-sm text-steel-500">{violationFileName || '点击上传 .xlsx/.xls 文件'}</p>
              {violationData && <p className="text-xs text-green-600 mt-1 font-medium">{violationData.rows.length} 行数据已就绪</p>}
            </div>
            <div className={`upload-zone glass-card rounded-xl border-2 border-dashed p-6 text-center cursor-pointer ${examData ? 'uploaded' : 'border-steel-300'}`} onClick={() => examInputRef.current?.click()}>
              <input ref={examInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFileUpload('exam', e)} />
              <div className="text-4xl mb-3">{examData ? '✅' : '📊'}</div>
              <h3 className="font-bold text-railway-700 mb-1">实训成绩表</h3>
              <p className="text-sm text-steel-500">{examFileName || '点击上传 .xlsx/.xls 文件'}</p>
              {examData && <p className="text-xs text-green-600 mt-1 font-medium">{examData.rows.length} 行数据已就绪</p>}
            </div>
            <div className={`upload-zone glass-card rounded-xl border-2 border-dashed p-6 text-center cursor-pointer ${questionBanks.length > 0 ? 'uploaded' : 'border-steel-300'}`} onClick={() => questionInputRef.current?.click()}>
              <input ref={questionInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={e => handleFileUpload('question', e)} />
              <div className="text-4xl mb-3">{questionBanks.length > 0 ? '✅' : '📚'}</div>
              <h3 className="font-bold text-railway-700 mb-1">题库文件（选填）</h3>
              <p className="text-sm text-steel-500">{questionBanks.length > 0 ? `已上传 ${questionBanks.length} 个题库` : '可多选上传'}</p>
              {questionFileNames.length > 0 && <div className="mt-2 flex flex-wrap justify-center gap-1">{questionFileNames.map((n, i) => <span key={i} className="tag-pill bg-railway-50 text-railway-700">{n}</span>)}</div>}
            </div>
          </div>
          <div className="flex justify-center mt-6">
            <button className="btn-railway px-8 py-3 rounded-lg text-base font-bold shadow-lg" disabled={(!violationData && !examData) || loading} onClick={handleParse}>
              {loading ? <span className="flex items-center gap-2"><span className="loading-spinner !w-5 !h-5 !border-2 !border-white/30 !border-t-white inline-block" />解析中…</span> : '开始解析数据'}
            </button>
          </div>
        </section>

        {/* Data Overview */}
        {isParsed && (
          <section className="section-enter">
            <h2 className="text-xl font-bold text-railway-700 mb-5 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              第二步：数据概览与人员选择
            </h2>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: '总人数', value: persons.length, unit: '人', color: 'text-railway-700' },
                { label: '责任人部门数', value: violationDeptCount, unit: '个', color: 'text-railway-600' },
                { label: '两违记录', value: totalViolations, unit: '条', color: 'text-cr-red' },
                { label: '实训记录', value: totalExams, unit: '条', color: 'text-green-600' },
              ].map(s => (
                <div key={s.label} className="stat-card rounded-xl p-5 border border-steel-200 text-center shadow-sm">
                  <div className={`text-3xl font-bold ${s.color}`}>{s.value}<span className="text-sm text-steel-400 ml-1 font-normal">{s.unit}</span></div>
                  <div className="text-sm text-steel-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Search + batch actions + AI toggle */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <input type="text" placeholder="搜索姓名…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="px-4 py-2 rounded-lg border border-steel-300 focus:border-railway-500 focus:ring-1 focus:ring-railway-500 outline-none text-sm w-48" />
              <button className="btn-railway px-4 py-2 rounded-lg text-sm" onClick={handleGenerateAll} disabled={loading || aiLoading}>
                {loading ? '生成中…' : `批量生成全部报告 (${persons.length}人)`}
              </button>
              {reports.size > 0 && (
                <>
                  <button className="btn-railway px-4 py-2 rounded-lg text-sm" onClick={handleDownloadAll}>批量下载Word ({reports.size}份)</button>
                  <button className="btn-railway px-4 py-2 rounded-lg text-sm" onClick={handleExportSummary}>导出汇总表(Excel)</button>
                </>
              )}
              {/* AI Toggle */}
              <label className="flex items-center gap-2 ml-auto cursor-pointer select-none">
                <span className="text-sm text-steel-600 font-medium">AI辅助生成</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={aiEnabled}
                    onChange={e => setAiEnabled(e.target.checked)}
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${aiEnabled ? 'bg-railway-700' : 'bg-steel-300'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform mt-0.5 ${aiEnabled ? 'translate-x-5.5 ml-[22px]' : 'translate-x-0.5 ml-[2px]'}`} />
                  </div>
                </div>
                {aiEnabled && <span className="tag-pill bg-railway-100 text-railway-700">Kimi</span>}
              </label>
            </div>

            {/* Two-level: Department → Persons */}
            <div className="glass-card rounded-xl border border-steel-200 shadow-sm overflow-hidden">
              {filteredDepts.length === 0 && <p className="text-steel-400 text-sm py-6 text-center">未找到匹配的人员</p>}
              {filteredDepts.map(dept => {
                const deptPersons = searchTerm
                  ? departments[dept].filter(p => p.name.includes(searchTerm))
                  : departments[dept];
                const isExpanded = expandedDept === dept;
                const deptViolations = deptPersons.reduce((s, p) => s + p.violations.length, 0);
                return (
                  <div key={dept} className="border-b border-steel-200 last:border-b-0">
                    <button
                      className={`w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors ${isExpanded ? 'bg-railway-50' : 'hover:bg-steel-50'}`}
                      onClick={() => setExpandedDept(isExpanded ? null : dept)}
                    >
                      <div className="flex items-center gap-3">
                        <svg className={`w-4 h-4 text-steel-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="font-bold text-railway-700">{dept}</span>
                        <span className="tag-pill bg-railway-100 text-railway-700">{deptPersons.length}人</span>
                        {deptViolations > 0 && <span className="tag-pill bg-red-100 text-red-600">{deptViolations}条两违</span>}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-1">
                        <div className="flex flex-wrap gap-2">
                          {deptPersons.map(person => {
                            const key = `${person.name}__${person.fleet}`;
                            const hasReport = reports.has(key);
                            const isSelected = selectedPerson?.name === person.name && selectedPerson?.fleet === person.fleet;
                            return (
                              <button key={key}
                                className={`person-chip px-3 py-1.5 rounded-lg text-sm border flex items-center gap-1.5 transition-all ${
                                  isSelected ? 'active' : hasReport ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-steel-300 text-steel-700 hover:border-railway-500'
                                }`}
                                onClick={() => handleSelectPerson(person)}
                                disabled={aiLoading}
                              >
                                {hasReport && !isSelected && <span className="text-green-500 text-xs">✓</span>}
                                {person.name}
                                {person.violations.length > 0 && <span className="tag-pill bg-red-100 text-red-600 ml-1">{person.violations.length}违</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Report Preview */}
        {currentReport && (
          <section className="section-enter">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h2 className="text-xl font-bold text-railway-700 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                第三步：{currentReport.person.name} 的分析报告
              </h2>
              <button className="btn-railway px-4 py-2 rounded-lg text-sm font-medium" onClick={handleDownloadCurrent}>下载Word报告</button>
            </div>

            <div className="glass-card rounded-xl border border-steel-200 overflow-hidden shadow-sm">
              {/* Info */}
              <div className="p-5 bg-gradient-to-r from-railway-50 to-white border-b border-steel-200">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div><span className="text-xs text-steel-400 block">姓名</span><span className="text-base font-bold text-railway-700">{currentReport.person.name}</span></div>
                  <div><span className="text-xs text-steel-400 block">部门</span><span className="text-base font-bold text-railway-700">{currentReport.person.fleet}</span></div>
                  <div><span className="text-xs text-steel-400 block">工资号</span><span className="text-base font-bold text-railway-700">{currentReport.person.salaryNumber || '-'}</span></div>
                  <div><span className="text-xs text-steel-400 block">两违次数</span><span className={`text-base font-bold ${currentReport.person.violations.length > 0 ? 'text-cr-red' : 'text-green-600'}`}>{currentReport.person.violations.length} 次</span></div>
                  <div><span className="text-xs text-steel-400 block">实训科目</span><span className="text-base font-bold text-railway-700">{currentReport.person.exams.length} 个</span></div>
                </div>
              </div>

              {/* Report body */}
              <div className="report-preview p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-railway-600 border-b-2 border-railway-500 pb-2 mb-3">一、两违情况</h3>
                  <div className="text-sm text-steel-700 leading-relaxed whitespace-pre-line bg-steel-50 rounded-lg p-4 border border-steel-200">
                    {currentReport.analysis.violationAnalysis}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-railway-600 border-b-2 border-railway-500 pb-2 mb-3">二、培训情况</h3>
                  <div className="text-sm text-steel-700 leading-relaxed whitespace-pre-line bg-steel-50 rounded-lg p-4 border border-steel-200">
                    {currentReport.analysis.trainingAnalysis}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-railway-600 border-b-2 border-railway-500 pb-2 mb-3">三、风险倾向</h3>
                  <div className="text-sm text-steel-700 leading-relaxed whitespace-pre-line bg-steel-50 rounded-lg p-4 border border-steel-200">
                    {currentReport.analysis.riskAnalysis || '暂无风险倾向分析'}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-railway-600 border-b-2 border-railway-500 pb-2 mb-3">四、培训建议</h3>
                  <div className="space-y-3">
                    {currentReport.analysis.suggestions.map((s, i) => (
                      <div key={i} className="bg-steel-50 border border-steel-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <span className="bg-railway-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                          <div><h4 className="font-bold text-railway-700 mb-1">{s.title}</h4><p className="text-sm text-steel-600 leading-relaxed">{s.content}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-railway-600 border-b-2 border-railway-500 pb-2 mb-3">五、考试题目（{currentReport.questions.length}题）</h3>
                  {currentReport.questions.length > 0 ? (
                    <div className="space-y-3">
                      {currentReport.questions.slice(0, 10).map((q, qi) => (
                        <div key={qi} className="bg-steel-50 border border-steel-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <span className="bg-railway-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{qi + 1}</span>
                            <div className="text-sm text-steel-700 flex-1">
                              <p className="font-medium">{q.questionText}</p>
                              {q.questionType && <p className="text-steel-500 text-xs mt-1">（{q.questionType}）</p>}
                              {q.options.length > 0 && (
                                <div className="mt-2 space-y-1 pl-2 border-l-2 border-railway-200">
                                  {q.options.map((opt, oi) => (
                                    <p key={oi} className="text-steel-600">{opt}</p>
                                  ))}
                                </div>
                              )}
                              <div className="mt-2 flex flex-wrap gap-3">
                                <span className="text-green-700 font-bold">答案：{q.answer}</span>
                                <span className="tag-pill bg-railway-50 text-railway-700">{q.category}</span>
                              </div>
                              {q.explanation && <p className="text-steel-400 mt-1 text-xs">解析：{q.explanation}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-steel-400 bg-steel-50 rounded-lg p-4 border border-steel-200">暂无匹配的考试题目，请上传题库文件</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="bg-gradient-to-r from-railway-800 to-railway-700 text-white/60 text-center py-6 mt-8">
        <p className="text-sm">机务段个人定向培训建议生成系统 v2.0</p>
        <p className="text-xs mt-1 text-white/40">基于数据分析 · 自动生成个人定向培训建议报告</p>
      </footer>
    </div>
  );
}
