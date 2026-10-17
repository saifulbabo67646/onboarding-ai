CREATE TABLE "research_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presenter_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"docs_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"phase" text,
	"error" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft" jsonb,
	"revisions" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "presenter" ADD COLUMN "knowledge" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "research_job" ADD CONSTRAINT "research_job_presenter_id_presenter_id_fk" FOREIGN KEY ("presenter_id") REFERENCES "public"."presenter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_job" ADD CONSTRAINT "research_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_job_presenter_idx" ON "research_job" USING btree ("presenter_id","started_at");