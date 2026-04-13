import { useState } from "react";
import { Building2 } from "lucide-react";
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
import type { ClinicCreatePayload } from "@/lib/api";

interface AddClinicDialogProps {
  onAdd: (data: ClinicCreatePayload) => Promise<unknown>;
  trigger?: React.ReactNode;
}

export function AddClinicDialog({ onAdd, trigger }: AddClinicDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const reset = () => {
    setName("");
    setAddress("");
    setCity("");
    setCountry("");
    setPhone("");
    setSpecialty("");
    setDescription("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Clinic name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onAdd({
        name: name.trim(),
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        phone: phone.trim() || undefined,
        specialty: specialty.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast({ title: "Clinic added successfully" });
      reset();
      setOpen(false);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Could not add clinic",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Building2 className="h-4 w-4 mr-1" /> Add Clinic
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Clinic</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <Input
            placeholder="Clinic name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-xl"
            autoComplete="off"
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
            Add Clinic
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
