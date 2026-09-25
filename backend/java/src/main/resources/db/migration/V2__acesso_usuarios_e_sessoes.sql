-- Sprint 2 (ADR-005): usuários do próprio Renda+, perfis e sessões opacas.

create table app_user (
    id                  uuid primary key default gen_random_uuid(),
    username            varchar(60) not null check (username ~ '^[a-z0-9._-]{3,60}$'),
    display_name        varchar(120) not null,
    profile             varchar(20) not null check (profile in ('ADMINISTRADOR', 'CONSULTA')),
    password_hash       text not null,
    active              boolean not null default true,
    failed_attempts     integer not null default 0 check (failed_attempts >= 0),
    locked_until        timestamptz,
    password_changed_at timestamptz not null default now(),
    version             bigint not null default 1 check (version >= 1),
    created_at          timestamptz not null default now(),
    created_by          varchar(100) not null,
    updated_at          timestamptz,
    updated_by          varchar(100)
);

create unique index app_user_username on app_user (username);

-- O banco guarda só o hash SHA-256 do token; o token em si existe apenas no processo principal do app.
create table user_session (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references app_user (id),
    token_hash    char(64) not null unique,
    created_at    timestamptz not null,
    last_seen_at  timestamptz not null,
    expires_at    timestamptz not null,
    revoked_at    timestamptz,
    revoke_reason varchar(40)
);

create index user_session_user on user_session (user_id) where revoked_at is null;
