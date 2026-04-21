// TODO: Replace with real Airtable API calls
export async function searchAirtable(query, scope = []) {
  return [
    {
      type: scope[0] || 'knowledge',
      id: 'demo_001',
      title: 'Demo Airtable Result',
      summary: `Placeholder result for query: ${query}`,
      score: 0.82,
      source: 'airtable'
    }
  ];
}

// TODO: Replace with real Airtable member context lookup
export async function getMemberContext(memberId) {
  return {
    member: {
      member_id: memberId,
      username: 'demo-user',
      client_name: 'Demo',
      tier: 'blackcard',
      status: 'active',
      expire_at: '2026-12-31T23:59:59Z'
    },
    context: {
      recent_sessions: [
        { session_id: 'sess_demo_001', status: 'confirmed' }
      ],
      recent_payments: [
        { payment_ref: 'pay_demo_001', payment_status: 'paid' }
      ],
      privileges: ['priority_concierge', 'exclusive_access'],
      notes_summary: 'Placeholder member context from Airtable connector'
    }
  };
}
