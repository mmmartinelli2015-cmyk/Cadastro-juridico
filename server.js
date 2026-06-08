import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();
console.log('Token carregado?', !!process.env.RD_CRM_API_TOKEN);

const app = express();

app.use(cors());
app.use(express.json());

const RD_CRM_API_TOKEN = process.env.RD_CRM_API_TOKEN;
const RD_CRM_ORGANIZATIONS_URL = 'https://crm.rdstation.com/api/v1/organizations';
const RD_CRM_TOKEN_CHECK_URL = 'https://crm.rdstation.com/api/v1/token/check';

if (!RD_CRM_API_TOKEN) {
  console.error('❌ RD_CRM_API_TOKEN não encontrado no arquivo .env');
  process.exit(1);
}

function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function safeString(value = '') {
  return String(value || '').trim();
}

function buildCustomField(custom_field_id, value) {
  const finalValue = String(value ?? '').trim();
  if (!finalValue) return null;
  return { custom_field_id, value: finalValue };
}

app.get('/', (req, res) => {
  return res.send('Servidor RD Webhook Pessoa Juridica online.');
});

app.get('/health', async (req, res) => {
  try {
    const response = await fetch(RD_CRM_TOKEN_CHECK_URL, {
      method: 'GET',
      headers: {
        Authorization: `Token token=${RD_CRM_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();
    console.log('🔎 /health PJ:', response.status, text);
    return res.status(response.status).send(text);
  } catch (err) {
    console.error('❌ Erro no /health PJ:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/rdstation-webhook', async (req, res) => {
  try {
    console.log('📥 [PJ] Recebi webhook:', JSON.stringify(req.body, null, 2));

    const lead = req.body?.leads?.[0];

    if (!lead) {
      return res.status(400).json({
        success: false,
        error: 'Payload inválido: leads[0] não encontrado.'
      });
    }

    const content =
      lead.first_conversion?.content ||
      lead.custom_fields ||
      lead.content ||
      {};

    const customFields = lead.custom_fields || {};

    const razaoSocial =
      safeString(content.cf_razao_social) ||
      safeString(customFields.cf_razao_social) ||
      safeString(lead.company) ||
      safeString(lead.name) ||
      `Empresa ${Date.now()}`;

    const nomeFantasia =
      safeString(content.cf_nome_fantasia) ||
      safeString(customFields.cf_nome_fantasia) ||
      safeString(lead.name);

    const endereco =
      safeString(content.cf_endereco) ||
      safeString(content['Endereço']) ||
      safeString(customFields.cf_endereco) ||
      safeString(customFields['Endereço']);

    const bairro =
      safeString(content.cf_bairro) ||
      safeString(customFields.cf_bairro);

    const cidade =
      safeString(content.cf_cidade) ||
      safeString(customFields.cf_cidade) ||
      safeString(lead.city);

    const estadoBruto =
      safeString(content.cf_estado) ||
      safeString(content.state) ||
      safeString(content['Estado Aberto']) ||
      safeString(customFields.cf_estado) ||
      safeString(lead.state);

    let uf = estadoBruto.toUpperCase();

    const NOME_PARA_UF = {
      'SAO PAULO': 'SP',
      'SÃO PAULO': 'SP',
      'RIO DE JANEIRO': 'RJ',
      'MINAS GERAIS': 'MG',
      'ESPIRITO SANTO': 'ES',
      'ESPÍRITO SANTO': 'ES'
    };

    if (NOME_PARA_UF[uf]) uf = NOME_PARA_UF[uf];

    const estadoFinal = uf;

    const representanteLegal =
      safeString(content.cf_representante_legal) ||
      safeString(customFields.cf_representante_legal);

    const email =
      safeString(lead.email) ||
      safeString(content.email_lead);

    const cnpj =
      onlyDigits(content.cf_cnpj || customFields.cf_cnpj);

    const numero =
      onlyDigits(content.cf_numero || customFields.cf_numero);

    const cep =
      onlyDigits(content.cf_cep || customFields.cf_cep);

    const telefone =
      onlyDigits(
        content.cf_telefone ||
        content.Telefone ||
        lead.personal_phone ||
        lead.mobile_phone ||
        lead.phone
      );

    const cpfRepresentante =
      onlyDigits(content.cf_cpf_representante || customFields.cf_cpf_representante);

    const rgRepresentante =
      safeString(content.cf_rg_representante || customFields.cf_rg_representante);

    console.log('🧾 [PJ] Campos normalizados:');
    console.log(JSON.stringify({
      razaoSocial,
      nomeFantasia,
      cnpj,
      endereco,
      numero,
      bairro,
      cidade,
      estadoBruto,
      estadoFinal,
      cep,
      telefone,
      email,
      representanteLegal,
      cpfRepresentante,
      rgRepresentante
    }, null, 2));

    const organizationPayload = {
      organization: {
        name: razaoSocial,
        organization_custom_fields: [
          buildCustomField('69b1c5f1473b730016d41971', razaoSocial),
          buildCustomField('69b1c5f75ea3200016f49791', nomeFantasia),
          buildCustomField('69b1c6040143ed00183457da', cnpj),
          buildCustomField('69b1c672a433580013d56a20', endereco),
          buildCustomField('69b1d0286520a80020939657', numero),
          buildCustomField('68ef934223f4b30014fd1ffd', bairro),
          buildCustomField('68ef9349528c560019741cc4', cidade),
          buildCustomField('69c189f58ae16600131fc9ac', estadoFinal),
          buildCustomField('69b1c68705e89500133632dc', cep),
          buildCustomField('69bc03a3f67e550016a1b98e', telefone),
          buildCustomField('68ef934c752228001c5ef627', email),
          buildCustomField('69b1c6a33068d1001cb0823f', representanteLegal),
          buildCustomField('69b1c62d459e5400184503dc', cpfRepresentante),
          buildCustomField('69b1c6451eb5e50021d115b7', rgRepresentante)
        ].filter(Boolean)
      }
    };

    console.log('📤 [PJ] Enviando para RD CRM /organizations:');
    console.log(JSON.stringify(organizationPayload, null, 2));

    const response = await fetch(
      `${RD_CRM_ORGANIZATIONS_URL}?token=${RD_CRM_API_TOKEN}`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify(organizationPayload)
      }
    );

    const bodyText = await response.text();
    console.log('📥 [PJ] Resposta CRM:', response.status, bodyText);

    let data;
    try { data = JSON.parse(bodyText); } catch { data = { raw: bodyText }; }

    if (data?.errors?.name?.includes('Empresa já cadastrada.')) {
      return res.status(409).json({
        success: false,
        message: 'Empresa já cadastrada no CRM.',
        crm: data
      });
    }

    if (!response.ok) {
      if (data?.errors?.organization_custom_fields) {
        console.error('❌ [PJ] Erros em organization_custom_fields:', JSON.stringify(data.errors.organization_custom_fields, null, 2));
      }

      return res.status(response.status).json({
        success: false,
        status: response.status,
        error: data
      });
    }

    if (data?.errors?.organization_custom_fields?.length) {
      console.error('⚠️ [PJ] Organização criada com falhas em alguns campos personalizados:', JSON.stringify(data.errors.organization_custom_fields, null, 2));
      return res.status(422).json({
        success: false,
        message: 'Organização criada com falhas em alguns campos personalizados.',
        crm: data
      });
    }

    return res.status(201).json({
      success: true,
      crm: data
    });
  } catch (err) {
    console.error('❌ Erro crítico no webhook CRM [PJ]:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Servidor RD Webhook Pessoa Juridica rodando em http://localhost:${PORT}`);
});