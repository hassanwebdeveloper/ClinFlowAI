import { useCallback, useState } from "react";
import {
  fetchClinics,
  createClinicApi,
  deleteClinicApi,
  updateClinicApi,
  type ApiClinic,
  type ClinicCreatePayload,
} from "@/lib/api";
import { SELECTED_CLINIC_KEY } from "@/lib/authStorage";

export interface Clinic {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  specialty?: string | null;
  description?: string | null;
}

function mapApiClinic(c: ApiClinic): Clinic {
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    city: c.city,
    country: c.country,
    phone: c.phone,
    specialty: c.specialty,
    description: c.description,
  };
}

function loadPersistedClinicId(): string {
  return localStorage.getItem(SELECTED_CLINIC_KEY) ?? "";
}

function persistClinicId(id: string) {
  if (id) {
    localStorage.setItem(SELECTED_CLINIC_KEY, id);
  } else {
    localStorage.removeItem(SELECTED_CLINIC_KEY);
  }
}

export function useClinicStore() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinicId, setSelectedClinicIdRaw] = useState(loadPersistedClinicId);
  const [loading, setLoading] = useState(false);

  const setSelectedClinicId = useCallback((id: string) => {
    setSelectedClinicIdRaw(id);
    persistClinicId(id);
  }, []);

  const loadClinics = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchClinics();
      const mapped = list.map(mapApiClinic);
      setClinics(mapped);
      const persisted = loadPersistedClinicId();
      if (persisted && !mapped.some((c) => c.id === persisted)) {
        setSelectedClinicId("");
      }
      return mapped;
    } catch {
      setClinics([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [setSelectedClinicId]);

  const addClinic = useCallback(
    async (data: ClinicCreatePayload) => {
      const created = await createClinicApi(data);
      const c = mapApiClinic(created);
      setClinics((prev) => [c, ...prev]);
      return c;
    },
    []
  );

  const updateClinic = useCallback(async (clinicId: string, data: Partial<ClinicCreatePayload>) => {
    const updated = await updateClinicApi(clinicId, data);
    const c = mapApiClinic(updated);
    setClinics((prev) => prev.map((x) => (x.id === clinicId ? c : x)));
    return c;
  }, []);

  const removeClinic = useCallback(
    async (clinicId: string) => {
      await deleteClinicApi(clinicId);
      setClinics((prev) => prev.filter((c) => c.id !== clinicId));
      setSelectedClinicIdRaw((cur) => {
        if (cur === clinicId) {
          persistClinicId("");
          return "";
        }
        return cur;
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedClinicId("");
  }, [setSelectedClinicId]);

  const selectedClinic = selectedClinicId
    ? clinics.find((c) => c.id === selectedClinicId)
    : undefined;

  return {
    clinics,
    selectedClinicId,
    selectedClinic,
    loading,
    loadClinics,
    addClinic,
    updateClinic,
    removeClinic,
    setSelectedClinicId,
    clearSelection,
  };
}
