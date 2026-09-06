import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

let pool: Pool | null = null;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedInterest = new Set(["BUYER", "SELLER", "BOTH"]);
const allowedCountries = new Set(["UG", "KE", "TZ", "RW", "OTHER"]);

async function ensureTable(db: Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS market_waitlist (
      id BIGSERIAL PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(180) NOT NULL,
      phone VARCHAR(32),
      country VARCHAR(16) NOT NULL DEFAULT 'UG',
      interest VARCHAR(16) NOT NULL DEFAULT 'BUYER',
      business_name VARCHAR(160),
      source VARCHAR(80),
      ip_address VARCHAR(80),
      user_agent TEXT,
      status VARCHAR(24) NOT NULL DEFAULT 'WAITING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(email, country)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS market_waitlist_interest_idx ON market_waitlist (interest, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS market_waitlist_country_idx ON market_waitlist (country, created_at DESC)`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim().slice(0, 120);
    const email = String(body?.email || "").trim().toLowerCase().slice(0, 180);
    const phone = String(body?.phone || "").trim().slice(0, 32) || null;
    const countryRaw = String(body?.country || "UG").trim().toUpperCase();
    const country = allowedCountries.has(countryRaw) ? countryRaw : "OTHER";
    const interestRaw = String(body?.interest || "BUYER").trim().toUpperCase();
    const interest = allowedInterest.has(interestRaw) ? interestRaw : "BUYER";
    const businessName = String(body?.businessName || "").trim().slice(0, 160) || null;
    const source = String(body?.source || "market-coming-soon").trim().slice(0, 80);

    if (name.length < 2) {
      return NextResponse.json({ message: "Please enter your full name." }, { status: 400 });
    }
    if (!emailPattern.test(email)) {
      return NextResponse.json({ message: "Please enter a valid email address." }, { status: 400 });
    }
    if ((interest === "SELLER" || interest === "BOTH") && !businessName) {
      return NextResponse.json({ message: "Please enter your business or shop name." }, { status: 400 });
    }

    const db = getPool();
    await ensureTable(db);

    const forwarded = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
    const ip = forwarded.split(",")[0]?.trim().slice(0, 80) || null;
    const userAgent = request.headers.get("user-agent")?.slice(0, 1000) || null;

    await db.query(
      `
        INSERT INTO market_waitlist
          (full_name, email, phone, country, interest, business_name, source, ip_address, user_agent)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (email, country)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = COALESCE(EXCLUDED.phone, market_waitlist.phone),
          interest = EXCLUDED.interest,
          business_name = COALESCE(EXCLUDED.business_name, market_waitlist.business_name),
          source = EXCLUDED.source,
          ip_address = EXCLUDED.ip_address,
          user_agent = EXCLUDED.user_agent,
          updated_at = NOW()
      `,
      [name, email, phone, country, interest, businessName, source, ip, userAgent],
    );

    const countResult = await db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM market_waitlist");
    const count = Number(countResult.rows[0]?.count || 0);

    return NextResponse.json({ ok: true, count });
  } catch (error) {
    console.error("market waitlist error", error);
    return NextResponse.json(
      { message: "The launch list is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }
}
