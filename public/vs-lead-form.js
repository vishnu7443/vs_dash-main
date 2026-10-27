/**
 * VS STUDIO DROP-IN CLIENT LEAD SUBMISSION SCRIPT
 * -----------------------------------------------
 * Include this script on your public agency/marketing website.
 * Works seamlessly with Webflow, Framer, WordPress, or plain HTML.
 *
 * Usage:
 * 1. Add <script src="https://your-admin-domain.com/vs-lead-form.js"></script>
 * 2. Configure your Supabase credentials:
 *    <script>
 *      window.VS_CONFIG = {
 *        supabaseUrl: "https://your-project.supabase.co",
 *        supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *      };
 *    </script>
 * 3. Give your form the id="vs-lead-form".
 */

(function () {
  'use strict';

  function initVsForm() {
    var form = document.getElementById('vs-lead-form') || document.querySelector('[data-vs-lead-form]');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      var config = window.VS_CONFIG || {};
      var supabaseUrl = config.supabaseUrl;
      var supabaseAnonKey = config.supabaseAnonKey;

      if (!supabaseUrl || !supabaseAnonKey) {
        alert('VS Studio Setup Error: window.VS_CONFIG.supabaseUrl and supabaseAnonKey must be defined.');
        return;
      }

      var submitBtn = form.querySelector('[type="submit"]') || form.querySelector('button');
      var originalBtnText = submitBtn ? submitBtn.innerText : 'Submit';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Transmitting brief...';
      }

      var formData = new FormData(form);
      var payload = {
        name: (formData.get('name') || '').toString().trim(),
        email: (formData.get('email') || '').toString().trim().toLowerCase(),
        phone: (formData.get('phone') || '').toString().trim() || null,
        company: (formData.get('company') || '').toString().trim() || null,
        service_type: (formData.get('service_type') || 'website_design_dev').toString(),
        requirements: (formData.get('requirements') || formData.get('message') || '').toString().trim(),
        budget_range: (formData.get('budget_range') || formData.get('budget') || '$5k-$10k').toString(),
        deadline: (formData.get('deadline') || '').toString().trim() || null,
        reference_links: (formData.get('reference_links') || formData.get('references') || '').toString().trim() || null,
        status: 'new'
      };

      try {
        var endpoint = supabaseUrl.replace(/\/+$/, '') + '/rest/v1/inquiries';
        var res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: 'Bearer ' + supabaseAnonKey,
            Prefer: 'return=representation'
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          var errText = await res.text();
          throw new Error('Supabase response ' + res.status + ': ' + errText);
        }

        form.reset();

        var statusContainer = document.getElementById('vs-form-status') || form.querySelector('.vs-form-status');
        if (statusContainer) {
          statusContainer.innerHTML =
            '<div style="padding:16px; border-radius:12px; background:#ecfdf5; border:1px solid #10b981; color:#065f46; font-size:14px; text-align:center;">' +
            '<strong>✨ Project Brief Received!</strong><br/>Vishnu & Sriram have received your inquiry. We will review your brief and respond within 24 hours.' +
            '</div>';
          statusContainer.style.display = 'block';
        } else {
          alert('✨ Project Brief Received!\n\nVishnu & Sriram have received your inquiry and will respond within 24 hours.');
        }

        var event = new CustomEvent('vs:inquiry-submitted', { detail: payload });
        window.dispatchEvent(event);

      } catch (err) {
        console.error('VS Lead Form Error:', err);
        alert('Submission failed: ' + (err.message || 'Please check your internet connection and try again.'));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = originalBtnText;
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVsForm);
  } else {
    initVsForm();
  }
})();
