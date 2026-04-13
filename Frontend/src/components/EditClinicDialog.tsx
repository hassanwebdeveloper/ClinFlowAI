import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Clinic } from "@/hooks/useClinicStore";
import type { ClinicCreatePayload } from "@/lib/api";

interface EditClinicDialogProps {
  clinic: Clinic;
  onUpdate: (clinicId: string, data: Partial<ClinicCreatePayload>) => Promise<unknown>;
}

export function EditClinicDialog({ clinic, onUpdate }: EditClinicDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(clinic.name);
  const [address, setAddress] = useState(clinic.address ?? "");
  const [city, setCity] = useState(clinic.city ?? "");
  const [country, setCountry] = useState(clinic.country ?? "");
  const [phone, setPhone] = useState(clinic.phone ?? "");
  const [specialty, setSpecialty] = useState(clinic.specialty ?? "");
  const [description, setDescription] = useState(clinic.description ?? "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setName(clinic.name);
    setAddress(clinic.address ?? "");
    setCity(clinic.city ?? "");
    setCountry(clinic.country ?? "");
    setPhone(clinic.phone ?? "");
    setSpecialty(clinic.specialty ?? "");
    setDescription(clinic.description ?? "");
  }, [open, clinic]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Clinic name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onUpdate(clinic.id, {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        phone: phone.trim(),
        specialty: specialty.trim(),
        description: description.trim(),
      });
      toast({ title: "Clinic updated" });
      setOpen(false);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Could not update clinic",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg shrink-0 text-muted-foreground hover:text-foreground"
          title="Edit clinic"
          onClick={(e) => e.stopPropagation()}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit clinic</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <Input
            placeholder="Clinic name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-xl"
          />
          <Input
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-11 rounded-xl"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-11 rounded-xl"
            />
            <Input
              placeholder="Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <Input
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 rounded-xl"
          />
          <Input
            placeholder="Specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className="h-11 rounded-xl"
          />
          <Input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-11 rounded-xl"
          />
          <Button type="submit" disabled={saving} className="w-full h-11 rounded-xl">
            Save changes
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
