import { useEffect, useLayoutEffect, useMemo } from "react";
import { Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { ClinicList } from "@/components/ClinicList";
import { PatientList } from "@/components/PatientList";
import { PatientView } from "@/components/PatientView";
import { VisitsView } from "@/components/VisitsView";
import { SearchView } from "@/components/SearchView";
import { SettingsView } from "@/components/SettingsView";
import { usePatientStore } from "@/hooks/usePatientStore";
import { useClinicStore } from "@/hooks/useClinicStore";
import { useAuth } from "@/hooks/useAuth";
import {
  clinicsPath,
  patientPath,
  patientVisitPath,
  patientsListPath,
  signInPath,
} from "@/lib/routes";

const Index = () => {
  const { user, signOut, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ patientId?: string; visitId?: string }>();

  const {
    clinics,
    selectedClinicId,
    selectedClinic,
    loading: clinicsLoading,
    loadClinics,
    addClinic,
    updateClinic,
    removeClinic,
    setSelectedClinicId,
    clearSelection: clearClinicSelection,
  } = useClinicStore();

  const {
    patients,
    selectedPatient,
    selectedPatientId,
    selectedVisitId,
    setSelectedPatientId,
    setSelectedVisitId,
    loadPatients,
    clearPatients,
    addPatient,
    addVisit,
    prepareVisitFromAudio,
    finalizeVisitFromAudio,
    updateVisitSoap,
    updateVisit,
    deleteVisit,
    deletePatient,
    regenerateVisitSoap,
  } = usePatientStore();

  const pathTab = useMemo(() => {
    const p = location.pathname;
    if (p.startsWith("/clinics")) return "clinics";
    if (p.startsWith("/visits")) return "visits";
    if (p.startsWith("/search")) return "search";
    if (p.startsWith("/settings")) return "settings";
    return "patients";
  }, [location.pathname]);

  const showPatientDetail = Boolean(params.patientId);
  const needsClinic = pathTab !== "clinics" && pathTab !== "settings" && !selectedClinicId;

  useEffect(() => {
    if (!isAuthenticated) {
      clearPatients();
      return;
    }
    void loadClinics();
  }, [isAuthenticated, clearPatients, loadClinics]);

  useEffect(() => {
    if (!isAuthenticated || !selectedClinicId) {
      clearPatients();
      return;
    }
    void loadPatients(selectedClinicId);
  }, [isAuthenticated, selectedClinicId, clearPatients, loadPatients]);

  useLayoutEffect(() => {
    if (params.patientId) {
      setSelectedPatientId(params.patientId);
    } else if (pathTab === "patients") {
      setSelectedPatientId("");
      setSelectedVisitId("");
    }
  }, [params.patientId, pathTab, setSelectedPatientId, setSelectedVisitId]);

  useLayoutEffect(() => {
    if (!params.patientId) return;
    const p = patients.find((x) => x.id === params.patientId);
    if (!p) return;
    if (params.visitId) {
      if (p.visits.some((v) => v.id === params.visitId)) {
        setSelectedVisitId(params.visitId);
      }
      return;
    }
    if (p.visits.length) {
      setSelectedVisitId((cur) =>
        cur && p.visits.some((v) => v.id === cur) ? cur : p.visits[0].id
      );
    } else {
      setSelectedVisitId("");
    }
  }, [patients, params.patientId, params.visitId, setSelectedVisitId]);

  useEffect(() => {
    if (!params.patientId || patients.length === 0) return;
    const exists = patients.some((p) => p.id === params.patientId);
    if (!exists) navigate(patientsListPath(), { replace: true });
  }, [patients, params.patientId, navigate]);

  useEffect(() => {
    if (!params.patientId || !params.visitId || patients.length === 0) return;
    const p = patients.find((x) => x.id === params.patientId);
    if (!p) return;
    if (!p.visits.some((v) => v.id === params.visitId)) {
      navigate(patientPath(params.patientId), { replace: true });
    }
  }, [patients, params.patientId, params.visitId, navigate]);

  if (!isAuthenticated) {
    return <Navigate to={signInPath()} replace />;
  }

  if (needsClinic && !clinicsLoading) {
    return <Navigate to={clinicsPath()} replace />;
  }

  const selectVisit = (patientId: string, visitId: string) => {
    navigate(patientVisitPath(patientId, visitId));
  };

  const handleSelectClinic = (clinicId: string) => {
    setSelectedClinicId(clinicId);
    navigate(patientsListPath());
  };

  const handleBackToClinics = () => {
    clearClinicSelection();
    clearPatients();
    navigate(clinicsPath());
  };

  const handleSignOut = () => {
    signOut();
    navigate(signInPath(), { replace: true });
  };

  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden">
      {pathTab !== "clinics" && (
        <AppSidebar
          userName={user?.name || "Doctor"}
          clinicName={selectedClinic?.name}
          onBackToClinics={handleBackToClinics}
          onSignOut={handleSignOut}
        />
      )}
      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
        {pathTab === "clinics" && (
          <ClinicList
            clinics={clinics}
            onAddClinic={addClinic}
            onUpdateClinic={updateClinic}
            onRemoveClinic={removeClinic}
            onSelectClinic={handleSelectClinic}
            onSignOut={handleSignOut}
          />
        )}
        {pathTab === "patients" && !showPatientDetail && selectedClinicId && (
          <PatientList
            patients={patients}
            selectedPatientId={selectedPatientId}
            onAddPatient={async (data) => {
              const p = await addPatient({ ...data, clinicId: selectedClinicId });
              navigate(patientPath(p.id));
            }}
            onDeletePatient={deletePatient}
          />
        )}
        {pathTab === "patients" && showPatientDetail && selectedPatient && (
          <PatientView
            patient={selectedPatient}
            selectedVisitId={selectedVisitId}
            onSelectVisit={(visitId) => selectVisit(selectedPatient.id, visitId)}
            onAddVisit={async (visit) => {
              await addVisit(selectedPatient.id, visit);
              navigate(patientVisitPath(selectedPatient.id, visit.id));
            }}
            onPrepareVisitFromAudio={(audios, labs, groups) =>
              prepareVisitFromAudio(selectedPatient.id, audios, labs, groups)
            }
            onFinalizeVisitFromAudio={async (audios, labs, opts) => {
              const vid = await finalizeVisitFromAudio(
                selectedPatient.id,
                audios,
                labs,
                opts
              );
              if (vid) navigate(patientVisitPath(selectedPatient.id, vid));
            }}
            onUpdateSoap={(visitId, soap) => updateVisitSoap(selectedPatient.id, visitId, soap)}
            onSaveVisit={(visitId, patch) => updateVisit(selectedPatient.id, visitId, patch)}
            onRegenerateSoap={(visitId, transcript) =>
              regenerateVisitSoap(selectedPatient.id, visitId, transcript)
            }
            onDeleteVisit={async (visitId) => {
              const wasCurrent =
                selectedVisitId === visitId ||
                params.visitId === visitId;
              const p = await deleteVisit(selectedPatient.id, visitId);
              if (!wasCurrent) return;
              if (!p.visits.length) {
                navigate(patientPath(p.id), { replace: true });
              } else {
                navigate(patientVisitPath(p.id, p.visits[0].id), { replace: true });
              }
            }}
            onDeletePatient={async (patientId) => {
              await deletePatient(patientId);
              navigate(patientsListPath(), { replace: true });
            }}
          />
        )}
        {pathTab === "visits" && <VisitsView patients={patients} />}
        {pathTab === "search" && <SearchView patients={patients} />}
        {pathTab === "settings" && <SettingsView />}
      </main>
    </div>
  );
};

export default Index;
