import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useStudent } from '../hooks/useStudent';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ROLES } from '../utils/constants';
import { calculatePace, calculateElementsSummary, getPaceRationale } from '../utils/paceCalculations';
import usePageTitle from '../hooks/usePageTitle';
import PaceSection from '../components/ui/PaceSection';
import StudentInfoSection from '../components/admin/StudentInfoSection';
import ReadingsSection from '../components/admin/ReadingsSection';
import ServiceElementsSection from '../components/admin/ServiceElementsSection';
import GuardiansSection from '../components/admin/GuardiansSection';
import BenchmarkScheduler from '../components/admin/BenchmarkScheduler';
import { useBenchmarks } from '../hooks/useBenchmarks';
import DvarTorahSection from '../components/admin/DvarTorahSection';

export default function StudentDetailPage() {
  const { studentId } = useParams();
  const [searchParams] = useSearchParams();
  const initialEditMode = searchParams.get('edit') === 'true';
  const { role } = useAuth();
  const {
    student,
    readings,
    elements,
    guardians,
    loading,
    error,
    refetch,
    updateStudent,
    createReading,
    deleteReading,
    updateReadingOverride,
    revertReadingOverride,
    checkVersesWithProgress,
    createElement,
    deleteElement,
    reorderElements,
    applyDefaultElements,
    createGuardian,
    updateGuardian,
    deleteGuardian,
  } = useStudent(studentId);

  // Benchmark meetings (admin sees all incl. pending; others see scheduled+ via RLS)
  const isAdmin = role === ROLES.ADMIN;
  const {
    benchmarks,
    upsertBenchmark,
  } = useBenchmarks(studentId, isAdmin);

  // D'var Torah stage: resolve the updater's display name
  const [dvarUpdaterName, setDvarUpdaterName] = useState(null);

  useEffect(() => {
    if (!student?.dvar_stage_updated_by) {
      setDvarUpdaterName(null);
      return;
    }
    async function fetchUpdaterName() {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', student.dvar_stage_updated_by)
        .single();
      setDvarUpdaterName(data?.display_name || null);
    }
    fetchUpdaterName();
  }, [student?.dvar_stage_updated_by]);

  // Refresh student record after d'var Torah stage change.
  // The RPC already wrote to the DB (stage + audit cols server-side);
  // refetch pulls the updated record so the audit line renders correctly.
  // Do NOT use updateStudent here — it would re-write the stage outside
  // the audit RPC, defeating its purpose as the single writable path.
  async function handleDvarStageChange() {
    try {
      await refetch();
    } catch {
      // The RPC already succeeded; swallow if the refetch fails.
      // Next page load will have the correct state.
    }
  }

  usePageTitle(student ? `${student.first_name} ${student.last_name}` : 'Student Detail');

  // ---- Pace enrichment (admin/tutor only) ----
  const isAdminOrTutor = role === ROLES.ADMIN || role === ROLES.TUTOR;
  const [paceData, setPaceData] = useState(null);
  const [elemSummary, setElemSummary] = useState(null);

  useEffect(() => {
    if (!isAdminOrTutor || !student || !studentId) return;

    async function fetchPaceEnrichment() {
      try {
        // Verse mastery counts
        const { data: verseData, error: vErr } = await supabase
          .from('verse_current_status')
          .select('quality')
          .eq('student_id', studentId);
        if (vErr) throw vErr;

        let totalVerses = 0;
        let masteredVerses = 0;
        (verseData || []).forEach((row) => {
          totalVerses += 1;
          if (row.quality === 'perfect') masteredVerses += 1;
        });

        // Element mastery counts
        const { data: elemData, error: eErr } = await supabase
          .from('element_current_status')
          .select('quality')
          .eq('student_id', studentId);
        if (eErr) throw eErr;

        let totalElems = 0;
        let masteredElems = 0;
        let startedElems = 0;
        (elemData || []).forEach((row) => {
          totalElems += 1;
          if (row.quality) {
            startedElems += 1;
            if (row.quality === 'perfect') masteredElems += 1;
          }
        });

        // First session date
        const { data: sessionData, error: sErr } = await supabase
          .from('sessions')
          .select('session_date')
          .eq('student_id', studentId)
          .order('session_date', { ascending: true })
          .limit(1);
        if (sErr) throw sErr;

        const firstSessionDate = sessionData?.[0]?.session_date || null;

        const pace = calculatePace({
          student,
          cohort: student.cohort,
          masteredVerseCount: masteredVerses,
          totalVerseCount: totalVerses,
          firstSessionDate,
        });

        setPaceData(pace);
        setElemSummary(calculateElementsSummary(masteredElems, startedElems, totalElems));
      } catch (err) {
        console.error('Failed to load pace data:', err.message);
      }
    }

    fetchPaceEnrichment();
  }, [isAdminOrTutor, student, studentId]);

  // ---- Loading skeleton ----
  if (loading) {
    return (
      <div className="page student-detail-skeleton">
        <div className="back-link skeleton skeleton-line" style={{ width: '140px', height: '16px' }}>&nbsp;</div>
        <div className="skeleton skeleton-line" style={{ width: '260px', height: '32px', marginTop: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>&nbsp;</div>
        <div className="skeleton skeleton-line" style={{ width: '160px', height: '32px', marginBottom: 'var(--space-5)' }}>&nbsp;</div>
        <div className="skeleton skeleton-card" style={{ marginBottom: 'var(--space-4)' }}>&nbsp;</div>
        <div className="skeleton skeleton-card" style={{ marginBottom: 'var(--space-4)' }}>&nbsp;</div>
        <div className="skeleton skeleton-card" style={{ marginBottom: 'var(--space-4)' }}>&nbsp;</div>
        <div className="skeleton skeleton-card">&nbsp;</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <Link to="/admin" className="back-link">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="10,3 5,8 10,13" /></svg>
          Back to students
        </Link>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="page">
        <Link to="/admin" className="back-link">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="10,3 5,8 10,13" /></svg>
          Back to students
        </Link>
        <div className="alert alert-error">Student not found.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <Link to="/admin" className="back-link">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="10,3 5,8 10,13" /></svg>
        Back to students
      </Link>

      <h1>{student.first_name} {student.last_name}</h1>

      <Link to={`/sessions?student=${studentId}`} className="btn btn-outline btn-small" style={{ alignSelf: 'flex-start' }}>
        View Session History
      </Link>

      {/* Pace section — admin/tutor only, always-visible rationale */}
      {isAdminOrTutor && paceData && (
        <PaceSection pace={paceData} elementsSummary={elemSummary} rationale={getPaceRationale(paceData)} />
      )}

      <StudentInfoSection student={student} onUpdate={updateStudent} initialEditMode={initialEditMode} />

      <ReadingsSection
        student={student}
        readings={readings}
        onCreateReading={createReading}
        onDeleteReading={deleteReading}
        onUpdateReadingOverride={updateReadingOverride}
        onRevertReadingOverride={revertReadingOverride}
        onCheckVersesWithProgress={checkVersesWithProgress}
      />

      {/* Benchmark meetings — admin scheduler */}
      {isAdmin && (
        <BenchmarkScheduler
          benchmarks={benchmarks}
          student={student}
          onUpsert={upsertBenchmark}
        />
      )}

      {/* D'var Torah stage — staff editor */}
      {isAdminOrTutor && (
        <DvarTorahSection
          student={student}
          updaterName={dvarUpdaterName}
          onStageChange={handleDvarStageChange}
        />
      )}

      <ServiceElementsSection
        elements={elements}
        onCreateElement={createElement}
        onDeleteElement={deleteElement}
        onReorderElements={reorderElements}
        onApplyDefaults={applyDefaultElements}
      />

      <GuardiansSection
        guardians={guardians}
        onCreateGuardian={createGuardian}
        onUpdateGuardian={updateGuardian}
        onDeleteGuardian={deleteGuardian}
      />
    </div>
  );
}
