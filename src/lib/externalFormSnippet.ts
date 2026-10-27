/**
 * VS Studio Lead Form SDK & Drop-in Submitter
 * -------------------------------------------
 * Drop this script into ANY external website (HTML, Webflow, Framer, WordPress, Next.js).
 * Submits directly to your shared Supabase database with zero server dependencies.
 */

export interface InquiryPayload {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  service_type: 'website_design_dev' | 'logo_branding' | 'ai_agents_automation' | string;
  requirements: string;
  budget_range: string;
  deadline?: string | null;
  reference_links?: string | null;
  file_urls?: string[];
}

export interface SubmitOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Submit inquiry to Supabase REST API via native fetch.
 * Works in any browser without installing `@supabase/supabase-js`.
 */
export async function submitInquiryToSupabase(
  payload: InquiryPayload,
  options: SubmitOptions
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const { supabaseUrl, supabaseAnonKey } = options;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      success: false,
      error: 'Missing Supabase URL or Anon Public Key.',
    };
  }

  // Sanitize and normalize URL
  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/rest/v1/inquiries`;

  const body = {
    name: payload.name.trim(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone?.trim() || null,
    company: payload.company?.trim() || null,
    service_type: payload.service_type || 'website_design_dev',
    requirements: payload.requirements.trim(),
    budget_range: payload.budget_range || '$5k-$10k',
    deadline: payload.deadline || null,
    reference_links: payload.reference_links?.trim() || null,
    file_urls: payload.file_urls || [],
    status: 'new', // Required by Supabase RLS policy
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        error: `Supabase error (${response.status}): ${errText}`,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Network or submission error: ${message}`,
    };
  }
}
