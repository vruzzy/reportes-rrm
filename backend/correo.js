// Envío de correos. Dos formas (se usa la primera que esté configurada):
//
// 1) Brevo por HTTPS (recomendado en Railway, que bloquea SMTP en planes sin Pro):
//      BREVO_API_KEY      → clave de API de brevo.com (Settings → SMTP & API → API keys)
//      GMAIL_USER         → remitente; debe estar verificado en Brevo (Senders)
// 2) Gmail por SMTP (funciona en local o en hosting que permita SMTP):
//      GMAIL_USER, GMAIL_APP_PASSWORD (contraseña de aplicación de 16 letras)
//
// Si nada está configurado, no se envía y quien llama recibe { enviado: false }.
const nodemailer = require('nodemailer');

const remitente = () => process.env.CORREO_REMITENTE || process.env.GMAIL_USER || '';

let transporte = null;
function obtenerTransporte() {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) return null;
  if (!transporte) {
    transporte = nodemailer.createTransport({
      service: 'gmail', auth: { user, pass },
      // Que nunca se quede colgado si el hosting bloquea SMTP
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
  }
  return transporte;
}

function usaBrevo() {
  return !!(process.env.BREVO_API_KEY && remitente());
}

function correoConfigurado() {
  return usaBrevo() || !!obtenerTransporte();
}

async function enviarBrevo({ para, asunto, html, texto }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Refugio Mendoza', email: remitente() },
        to: [{ email: para }],
        subject: asunto, htmlContent: html, textContent: texto,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Brevo respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } finally {
    clearTimeout(t);
  }
}

function escapar(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plantilla({ titulo, parrafos, boton, enlace, pie }) {
  const ps = parrafos.map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3b3a46">${escapar(p)}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f3f2f6;font-family:Segoe UI,Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#13111b;padding:20px 28px;color:#ffffff;font-size:16px;font-weight:600">Refugio Mendoza · Gestión</td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 16px;font-size:21px;color:#13111b">${escapar(titulo)}</h1>
        ${ps}
        <p style="margin:24px 0"><a href="${escapar(enlace)}" style="display:inline-block;background:#c23a6b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${escapar(boton)}</a></p>
        <p style="margin:0 0 6px;font-size:13px;color:#77758a">Si el botón no funciona, copia este enlace en tu navegador:</p>
        <p style="margin:0 0 18px;font-size:13px;word-break:break-all"><a href="${escapar(enlace)}" style="color:#c23a6b">${escapar(enlace)}</a></p>
        <p style="margin:0;font-size:13px;color:#77758a">${escapar(pie)}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

async function enviar({ para, asunto, html, texto }) {
  const t = usaBrevo() ? null : obtenerTransporte();
  if (!usaBrevo() && !t) return { enviado: false, motivo: 'no_configurado' };
  try {
    if (usaBrevo()) {
      await enviarBrevo({ para, asunto, html, texto });
    } else {
      await t.sendMail({
        from: `"Refugio Mendoza" <${remitente()}>`,
        to: para, subject: asunto, html, text: texto,
      });
    }
    return { enviado: true };
  } catch (err) {
    console.error('[Correo] No se pudo enviar a', para, '-', err.message);
    return { enviado: false, motivo: 'error' };
  }
}

function enviarInvitacion({ para, nombre, enlace, invitadoPor }) {
  const parrafos = [
    `Hola ${nombre}:`,
    `${invitadoPor} te dio acceso al sistema de Gestión de Residencia Refugio Mendoza.`,
    'Para entrar, crea tu contraseña con el siguiente botón. Tu usuario es este correo.',
  ];
  return enviar({
    para, asunto: 'Tu acceso a Gestión · Refugio Mendoza',
    html: plantilla({ titulo: 'Bienvenido(a) a Gestión', parrafos, boton: 'Crear mi contraseña', enlace, pie: 'El enlace vence en 7 días y solo se puede usar una vez.' }),
    texto: `${parrafos.join('\n')}\n\nCrea tu contraseña aquí: ${enlace}\n\nEl enlace vence en 7 días.`,
  });
}

function enviarRecuperacion({ para, nombre, enlace }) {
  const parrafos = [
    `Hola ${nombre}:`,
    'Recibimos una solicitud para restablecer tu contraseña de Gestión.',
    'Si fuiste tú, crea una nueva con el siguiente botón. Si no lo pediste, ignora este correo; tu contraseña no cambiará.',
  ];
  return enviar({
    para, asunto: 'Restablecer contraseña · Refugio Mendoza',
    html: plantilla({ titulo: 'Restablecer contraseña', parrafos, boton: 'Crear nueva contraseña', enlace, pie: 'El enlace vence en 1 hora y solo se puede usar una vez.' }),
    texto: `${parrafos.join('\n')}\n\nCrea tu nueva contraseña aquí: ${enlace}\n\nEl enlace vence en 1 hora.`,
  });
}

function enviarAvisoRegistro({ para, nombre, email, enlace }) {
  const parrafos = [
    `${nombre} (${email}) solicitó una cuenta en Gestión.`,
    'No podrá ver nada hasta que la apruebes y le asignes un puesto en Configuración → Usuarios y permisos.',
  ];
  return enviar({
    para, asunto: `Nueva solicitud de cuenta: ${nombre}`,
    html: plantilla({ titulo: 'Nueva solicitud de cuenta', parrafos, boton: 'Revisar solicitud', enlace, pie: 'Si no conoces a esta persona, rechaza la solicitud.' }),
    texto: `${parrafos.join('\n')}\n\nRevísala aquí: ${enlace}`,
  });
}

function enviarAviso({ para, titulo, texto, enlace }) {
  const parrafos = [texto || titulo, 'Este aviso también está en la campanita de Gestión.'];
  return enviar({
    para, asunto: titulo,
    html: plantilla({ titulo, parrafos, boton: 'Abrir Gestión', enlace, pie: 'Los avisos que recibe cada rol se cambian en Configuración → Permisos y notificaciones.' }),
    texto: `${parrafos.join('\n')}\n\n${enlace}`,
  });
}

module.exports = { correoConfigurado, enviarInvitacion, enviarRecuperacion, enviarAvisoRegistro, enviarAviso };
