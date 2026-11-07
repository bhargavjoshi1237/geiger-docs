"use client";

import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";

// Lives inside DialogContent so its draft resets every time the dialog opens.
function CollectionForm({ collection, onCancel, onSave }) {
  const editing = Boolean(collection);
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the collection a name.");
      return;
    }
    onSave({ name: trimmed, description: description.trim() });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Rename collection" : "New collection"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the name and description shown across the workspace."
            : "Group related documents together. A document can sit in one collection at a time."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <Field label="Name" htmlFor="collection-name">
          <Input
            id="collection-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Policies"
            autoFocus
          />
        </Field>
        <Field label="Description" htmlFor="collection-description" hint="Optional.">
          <Textarea
            id="collection-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What belongs in this collection?"
            className="resize-none"
          />
        </Field>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={submit}>
          {editing ? "Save changes" : "Create collection"}
        </Button>
      </DialogFooter>
    </>
  );
}

// Create (no `collection`) and rename (with `collection`) share this dialog.
export function CollectionDialog({ open, onOpenChange, collection = null, onSave }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <CollectionForm
          collection={collection}
          onCancel={() => onOpenChange(false)}
          onSave={(values) => {
            onSave(values);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

// Confirms a delete; the collection's documents are kept and become unfiled.
export function DeleteCollectionDialog({ open, onOpenChange, collection, documentCount = 0, onConfirm }) {
  const docs = documentCount === 1 ? "The 1 document" : `All ${documentCount} documents`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete collection</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{collection?.name}</span>?{" "}
            {documentCount
              ? `${docs} in it stay in the project and become unfiled.`
              : "It doesn't contain any documents."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Trash2 className="h-4 w-4" /> Delete collection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CollectionDialog;
