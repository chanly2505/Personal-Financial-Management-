"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Client-side demos for the design-system page (overlays, menus, toasts). */
export function InteractiveDemos() {
  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Select and tabs</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <FormField id="ds-currency" label="Currency">
            <Select defaultValue="USD">
              <SelectTrigger>
                <SelectValue placeholder="Choose a currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">US Dollar (USD)</SelectItem>
                <SelectItem value="KHR">Cambodian Riel (KHR)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <Tabs defaultValue="expense">
            <TabsList>
              <TabsTrigger value="expense">Money out</TabsTrigger>
              <TabsTrigger value="income">Money in</TabsTrigger>
              <TabsTrigger value="transfer">Move money</TabsTrigger>
            </TabsList>
            <TabsContent value="expense" className="text-sm text-muted-foreground">
              Expense form goes here.
            </TabsContent>
            <TabsContent value="income" className="text-sm text-muted-foreground">
              Income form goes here.
            </TabsContent>
            <TabsContent value="transfer" className="text-sm text-muted-foreground">
              Transfer form goes here.
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Overlays and feedback</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename account</DialogTitle>
                <DialogDescription>Choose a name you will recognise.</DialogDescription>
              </DialogHeader>
              <FormField id="ds-dialog-name" label="Name">
                <Input defaultValue="Wallet" />
              </FormField>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button onClick={() => toast.success("Account renamed")}>Save</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            trigger={<Button variant="destructive">Delete…</Button>}
            title="Delete 'Sample entry'?"
            description="This cannot be undone."
            onConfirm={async () => {
              await new Promise((resolve) => setTimeout(resolve, 600));
              toast.success("Deleted");
            }}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>
                <Pencil aria-hidden="true" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Trash2 aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Hover or focus me</Button>
            </TooltipTrigger>
            <TooltipContent>Supplementary hint only</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success("Expense added")}>
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.error("Couldn't save. Please try again.")}
          >
            Error toast
          </Button>
          <Button variant="secondary" onClick={() => toast.info("Rates are approximate")}>
            Info toast
          </Button>
        </div>
      </section>
    </>
  );
}
