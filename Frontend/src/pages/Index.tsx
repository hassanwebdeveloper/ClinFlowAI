import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { PatientList } from "@/components/PatientList";
import { PatientView } from "@/components/PatientView";
import { VisitsView } from "@/components/VisitsView";
import { SearchView } from "@/components/SearchView";
import { SettingsView } from "@/components/SettingsView";
import { usePatientStore } from "@/hooks/usePatientStore";
import { useAuth } from "@/hooks/useAuth";
import Auth from "@/pages/Auth";

const Index = () => {
  const { user, signIn, signUp, signOut, isAuthenticated } = useAuth();
  const store = usePatientStore();
  const [activeTab, setActiveTab] = useState("patients");
  const [showPatientDetail, setShowPatientDetail] = useState(false);

  useEffect(() => {
    if (store.patients.length === 0) setShowPatientDetail(false);
  }, [store.patients.length]);

  if (!isAuthenticated) {
    return <Auth onSignIn={signIn} onSignUp={signUp} />;
  }

  const selectPatient = (id: string) => {
    store.setSelectedPatientId(id);
    setShowPatientDetail(true);
    setActiveTab("patients");
  };

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setShowPatientDetail(false); }}
        userName={user?.name || "Doctor"}
        onSignOut={signOut}
      />
      <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
        {activeTab === "patients" && !showPatientDetail && (
          <PatientList
            patients={store.patients}
            selectedPatientId={store.selectedPatientId}
            onSelectPatient={selectPatient}
            onAddPatient={store.addPatient}
          />
        )}
        {activeTab === "patients" && showPatientDetail && store.selectedPatient && (
          <PatientView
            patient={store.selectedPatient}
            selectedVisitId={store.selectedVisitId}
            onSelectVisit={store.setSelectedVisitId}
            onAddVisit={(visit) => store.addVisit(store.selectedPatientId, visit)}
            onUpdateSoap={(visitId, soap) =>
              store.updateVisitSoap(store.selectedPatientId, visitId, soap)
            }
          />
        )}
        {activeTab === "visits" && (
          <VisitsView patients={store.patients} onSelectPatient={selectPatient} />
        )}
        {activeTab === "search" && (
          <SearchView patients={store.patients} onSelectPatient={selectPatient} />
        )}
        {activeTab === "settings" && <SettingsView />}
      </main>
    </div>
  );
};

export default Index;
