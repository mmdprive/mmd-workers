🖤 MMD Privé — Core System Architecture
Overview

MMD Privé is a controlled access system, not a marketplace.

This system is designed to:

manage private client access
control experience through structured flows
automate onboarding, payment, and lifecycle
eliminate manual chat handling
🎯 Core Flow
User → /trust/inme → chat-worker → payments → admin → lifecycle
🧠 Core Principles (LOCK)
Airtable = Source of Truth
session_id = primary flow key
payment_ref = financial idempotency key
package_code = access control logic
Workers are strictly separated
chat-worker = public interface
telegram-worker = internal only
Do NOT expose Airtable or secrets to frontend
🏗️ System Architecture
[ Web / Telegram / LINE ]
            ↓
        chat-worker (AI / intake)
            ↓
        payments-worker (money)
            ↓
        admin-worker (access control)
            ↓
        events-worker (automation)
            ↓
        telegram-worker (internal)
🧩 Airtable — Source of Truth
Table	Purpose
Members	identity + summary
member_packages	package lifecycle (PRIMARY LOGIC)
Payments	financial truth
Sessions	flow bridge
Activity Logs	audit trail
⚙️ Workers
1. chat-worker (Public Entry)

Role

entry point from /trust/inme
collect user intent
create session
route to payment

Writes → Sessions

session_id
memberstack_id
package_code
membership_action
payment_ref
created_at
2. payments-worker (Money Layer)

Role

create payment session
verify payment (PromptPay)
write Payments
trigger admin-worker

Endpoints

POST /v1/pay/create
{
  "session_id": "sess_xxx",
  "memberstack_id": "memstk_xxx",
  "package_code": "guest7",
  "amount_thb": 2000,
  "payment_type": "full"
}
POST /v1/pay/verify
{
  "session_id": "sess_xxx",
  "payment_ref": "pay_xxx",
  "payment_status": "paid",
  "verification_status": "verified",
  "provider": "promptpay"
}

Writes → Payments

payment_ref
payment_date
amount_thb
payment_status
payment_type
verification_status
session_id
package_code
🔥 Payment Rule (LOCK)

Only count toward Guest7 qualification if:

payment_status = paid
payment_type IN (deposit, final, full)
❌ NOT tips
3. admin-worker (Access Control)

Role

apply membership
create package lifecycle
update member state
POST /v1/admin/membership/apply
{
  "memberstack_id": "memstk_xxx",
  "member_email": "user@example.com",
  "package_code": "guest7",
  "payment_ref": "pay_xxx",
  "paid_at": "ISO"
}

Writes → member_packages

package_code
status = active
start_at
expires_at
payment_ref

Updates → Members

current_package_code
member_status
membership_expiry
4. events-worker (Automation)

Role

lifecycle automation
guest qualification
expiry handling
Daily Job

Step 1 — Expiry

IF now > expires_at
→ status = expired

Step 2 — Qualification

sum(payments within 30 days)

IF total >= 2000
→ qualified

ELSE IF now > eval_ends_at
→ closed

Writes

member_packages (status)
Members (summary update)
Activity Logs (audit)
5. telegram-worker (Internal Only)

Role

send internal notifications
NOT user-facing

Triggers

payment verified
guest7 activated
guest7 expired
guest7 qualified
upgrade events
🔁 End-to-End Flow
Guest7 Entry
User → /trust/inme
→ chat-worker
→ payments-worker
→ verify payment
→ admin-worker
→ member_packages created
→ events-worker handles lifecycle
Upgrade Flow
qualified guest
→ new payment
→ admin-worker apply standard/premium
→ Members updated
🧬 Package Model
Package	Meaning
guest7	temporary access (7 days + 30-day evaluation)
standard	base access
premium	higher access
blackcard	elite
🔥 IMPORTANT
Standard / Premium = pricing + access level only
NOT separate systems
All flows go through same backend
🧪 Guest7 Logic
Rule	Value
Access duration	7 days
Evaluation window	30 days
Spend requirement	2,000 THB
Outcome
Condition	Result
spend ≥ 2000	qualified
spend < 2000 after 30d	closed
🔐 Locked Fields (DO NOT CHANGE)
session_id
payment_ref
memberstack_id
package_code
payment_type
payment_status
verification_status
amount_thb
⚠️ Critical Rules
Do NOT rename Airtable fields after production
Do NOT expose Airtable to frontend
session_id must flow across all workers
payment_ref must be unique
member_packages = lifecycle truth
Payments = financial truth
Members = summary only
🚀 Phase 1 Scope
MUST HAVE
chat-worker session creation
payments-worker create + verify
admin-worker apply guest7
Airtable integration working
SHOULD HAVE
telegram internal notify
NEXT
events-worker lifecycle automation
💎 Final Note

This system is not a typical CRUD app.

It is:

Access Control Engine + Experience Engine

Build it as a controlled system, not a marketplace.
