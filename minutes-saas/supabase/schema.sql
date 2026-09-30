-- 相手(名簿)。email は後から入力できるよう NULL 可
create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zoom_name text,            -- Zoom上の表示名(参加者の自動照合用)
  email text,
  created_at timestamptz default now()
);
create unique index contacts_email_idx on contacts (lower(email)) where email is not null;
create unique index contacts_zoom_name_idx on contacts (lower(zoom_name)) where zoom_name is not null;

-- 議事録の金庫
create table meetings (
  id uuid primary key default gen_random_uuid(),
  zoom_uuid text unique,
  topic text,
  started_at timestamptz,
  transcript_raw text,
  transcript_clean text,     -- 要約ではなく全文の清書
  status text not null default 'stored', -- stored / analyzed / approved
  skip_analysis boolean not null default false, -- 分析不要(全文保存のみ)
  created_at timestamptz default now()
);

create table meeting_participants (
  meeting_id uuid references meetings on delete cascade,
  contact_id uuid references contacts on delete cascade,
  primary key (meeting_id, contact_id)
);

-- 分析テンプレート(どんな観点・構成で分析するか)
create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instructions text not null,
  is_default boolean not null default false,
  created_at timestamptz default now()
);
create unique index templates_default_idx on templates (is_default) where is_default;
insert into templates (name, instructions, is_default) values
  ('標準', '構成: 1.論点の整理 2.相手の課題・要望 3.決まったこと 4.次のアクション(担当・期限つき) 5.所感と提案。', true),
  ('営業商談', '構成: 1.相手の現状と課題 2.購買意欲と決裁の状況 3.懸念・反論とその対応 4.次のステップ(担当・期限つき) 5.提案の方向性。', false);

-- 分析結果(1会議1件)
create table analyses (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid unique references meetings on delete cascade,
  content text not null,
  template_id uuid references templates on delete set null,
  approved_at timestamptz,
  created_at timestamptz default now()
);

-- 配信キュー。email が無い相手は waiting_email で待機し、入力されたら自動送信
create table deliveries (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses on delete cascade,
  contact_id uuid references contacts on delete cascade,
  status text not null default 'waiting_email', -- waiting_email / sent / failed
  sent_at timestamptz,
  error text,
  unique (analysis_id, contact_id)
);

-- 相手ログイン用のワンタイムトークン(ハッシュのみ保存)
create table login_tokens (
  token_hash text primary key,
  contact_id uuid references contacts on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

alter table templates enable row level security;
alter table login_tokens enable row level security;
alter table contacts enable row level security;
alter table meetings enable row level security;
alter table meeting_participants enable row level security;
alter table analyses enable row level security;
alter table deliveries enable row level security;
-- ポリシー無し = service role(サーバー)以外は一切読めない
