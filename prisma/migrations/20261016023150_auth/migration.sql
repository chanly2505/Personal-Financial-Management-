-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "reset_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "auth_rate_limits_reset_at_idx" ON "auth_rate_limits"("reset_at");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written constraints (docs/DATABASE.md §5).
ALTER TABLE "users"
  ADD CONSTRAINT "users_session_version_nonnegative_chk" CHECK ("session_version" >= 0);

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_hash_format_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "auth_rate_limits"
  ADD CONSTRAINT "auth_rate_limits_key_format_chk" CHECK ("key" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "auth_rate_limits_count_positive_chk" CHECK ("count" > 0);
