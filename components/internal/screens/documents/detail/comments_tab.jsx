"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, Button, LoadingArea, Textarea } from "@geiger/ui";
import { EmptyState, SectionCard } from "@/components/internal/shared/screen_kit";
import { formatDate, formatRelative } from "@/components/internal/screens/documents/constants";
import { canComment } from "@/components/internal/screens/documents/access";
import {
  createDocumentComment,
  listDocumentComments,
  softDeleteDocumentComment,
} from "@/lib/supabase/document_comments";
import { initials } from "./utils";

// Flat comment thread, oldest first; commenters and editors can post, everyone sees it.
export function CommentsTab({ document, user, access }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const allowed = canComment(access);

  useEffect(() => {
    let cancelled = false;
    listDocumentComments(document.id).then((rows) => {
      if (cancelled) return;
      setComments(rows ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [document.id]);

  // Your own comments, or any comment when nobody is signed in.
  const canDelete = (comment) => !user || comment.createdBy === user.id;

  const post = async () => {
    const text = body.trim();
    if (!text || posting) return;
    const optimistic = {
      id: crypto.randomUUID(),
      documentId: document.id,
      body: text,
      authorName: user?.name || "You",
      authorEmail: user?.email || "",
      createdBy: user?.id ?? null,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    setBody("");
    setPosting(true);
    const saved = await createDocumentComment(optimistic);
    setPosting(false);
    if (!saved) {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      setBody(text);
      toast.error("Couldn't post your comment.");
      return;
    }
    setComments((prev) => prev.map((c) => (c.id === optimistic.id ? saved : c)));
    toast.success("Comment posted");
  };

  const remove = async (comment) => {
    const index = comments.findIndex((c) => c.id === comment.id);
    setComments((prev) => prev.filter((c) => c.id !== comment.id));
    const ok = await softDeleteDocumentComment(comment.id);
    if (!ok) {
      setComments((prev) => {
        const next = [...prev];
        next.splice(Math.max(index, 0), 0, comment);
        return next;
      });
      toast.error("Couldn't delete the comment.");
      return;
    }
    toast.success("Comment deleted");
  };

  const count = comments.length;

  return (
    <SectionCard
      title="Comments"
      description={
        loading ? "Loading the thread…" : `${count} ${count === 1 ? "comment" : "comments"}`
      }
      className="max-w-3xl"
    >
      {loading ? (
        <LoadingArea size={32} label="Loading comments" className="py-10" />
      ) : count ? (
        <ul className="divide-y divide-border">
          {comments.map((comment) => {
            const author = comment.authorName || comment.authorEmail || "Someone";
            return (
              <li key={comment.id} className="flex gap-3 py-4 first:pt-0">
                <Avatar size="sm" className="mt-0.5">
                  <AvatarFallback className="text-[10px] font-medium">{initials(author)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{author}</span>
                    <span
                      className="shrink-0 text-xs text-text-tertiary"
                      title={formatDate(comment.createdAt)}
                    >
                      {formatRelative(comment.createdAt)}
                    </span>
                    {canDelete(comment) ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => remove(comment)}
                        aria-label="Delete comment"
                        className="ml-auto text-text-tertiary hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">
                    {comment.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title="No comments yet"
          description={allowed ? "Start the conversation below." : "Comments will show up here."}
          className="py-10"
        />
      )}

      {allowed ? (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                post();
              }
            }}
            placeholder="Add a comment…"
            aria-label="New comment"
            className="min-h-[88px] resize-y"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-tertiary">Ctrl/⌘ + Enter to post</span>
            <Button
              onClick={post}
              disabled={!body.trim() || posting}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Post
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 border-t border-border pt-4 text-sm text-text-tertiary">
          You have view-only access, so you can read comments but not post them.
        </p>
      )}
    </SectionCard>
  );
}

export default CommentsTab;
