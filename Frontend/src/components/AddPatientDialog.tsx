import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface AddPatientDialogProps {
  onAdd: (patient: { uiId: string; name: string; age: number; gender: string }) => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialUiId?: string;
}

export function AddPatientDialog({ onAdd, open: openProp, onOpenChange, initialUiId }: AddPatientDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [uiId, setUiId] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setUiId(initialUiId?.trim() ?? "");
    setName("");
    setAge("");
    setGender("");
  }, [open, initialUiId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uiId.trim() || !name.trim() || !age || !gender) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onAdd({ uiId: uiId.trim(), name: name.trim(), age: parseInt(age, 10), gender });
      toast({ title: "Patient added successfully ✓" });
      setUiId("");
      setName("");
      setAge("");
      setGender("");
      setOpen(false);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Could not add patient",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4 mr-1" /> Add Patient
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Patient</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Reference ID — fixed after save</p>
            <Input
              placeholder="e.g. P-2041"
              value={uiId}
              onChange={(e) => setUiId(e.target.value)}
              className="h-11 rounded-xl"
              autoComplete="off"
            />
          </div>
          <Input
            placeholder="Patient name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-xl"
          />
          <Input
            type="number"
            placeholder="Age"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            min={0}
            max={150}
            className="h-11 rounded-xl"
          />
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={saving} className="w-full h-11 rounded-xl">
            Add Patient
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
