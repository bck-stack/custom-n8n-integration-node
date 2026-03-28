import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * HttpTransform Node
 * Performs an HTTP request and optionally transforms the response
 * using a JSONPath-like dot-notation extractor or a JS expression.
 */
export class HttpTransform implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'HTTP Transform',
    name: 'httpTransform',
    icon: 'fa:exchange-alt',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["method"]}} {{$parameter["url"]}}',
    description: 'Make an HTTP request and transform the response in one step.',
    defaults: { name: 'HTTP Transform' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'httpTransformApi',
        required: false,
        displayOptions: {
          show: { useCredentials: [true] },
        },
      },
    ],
    properties: [
      // --- Request ---
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        options: [
          { name: 'GET',    value: 'GET' },
          { name: 'POST',   value: 'POST' },
          { name: 'PUT',    value: 'PUT' },
          { name: 'PATCH',  value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' },
        ],
        default: 'GET',
      },
      {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'https://api.example.com/endpoint',
        description: 'Full URL or path (if base URL is set in credentials).',
      },
      {
        displayName: 'Use Credentials',
        name: 'useCredentials',
        type: 'boolean',
        default: false,
        description: 'Attach auth header from credential.',
      },
      {
        displayName: 'Request Headers',
        name: 'headers',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        options: [
          {
            name: 'header',
            displayName: 'Header',
            values: [
              { displayName: 'Name',  name: 'name',  type: 'string', default: '' },
              { displayName: 'Value', name: 'value', type: 'string', default: '' },
            ],
          },
        ],
      },
      {
        displayName: 'Request Body (JSON)',
        name: 'body',
        type: 'json',
        default: '{}',
        displayOptions: { show: { method: ['POST', 'PUT', 'PATCH'] } },
      },
      {
        displayName: 'Timeout (ms)',
        name: 'timeout',
        type: 'number',
        default: 10000,
      },
      // --- Transform ---
      {
        displayName: 'Transform Mode',
        name: 'transformMode',
        type: 'options',
        options: [
          { name: 'None — Pass raw response',          value: 'none' },
          { name: 'Extract field (dot notation)',       value: 'extract' },
          { name: 'Rename keys',                        value: 'rename' },
          { name: 'Filter array by field value',        value: 'filter' },
        ],
        default: 'none',
      },
      {
        displayName: 'Field Path',
        name: 'fieldPath',
        type: 'string',
        default: '',
        placeholder: 'data.items',
        description: 'Dot-notation path to extract from the response (e.g. "data.results").',
        displayOptions: { show: { transformMode: ['extract', 'filter'] } },
      },
      {
        displayName: 'Filter: Field',
        name: 'filterField',
        type: 'string',
        default: '',
        placeholder: 'status',
        displayOptions: { show: { transformMode: ['filter'] } },
      },
      {
        displayName: 'Filter: Value',
        name: 'filterValue',
        type: 'string',
        default: '',
        placeholder: 'active',
        displayOptions: { show: { transformMode: ['filter'] } },
      },
      {
        displayName: 'Key Mappings',
        name: 'keyMappings',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        displayOptions: { show: { transformMode: ['rename'] } },
        options: [
          {
            name: 'mapping',
            displayName: 'Mapping',
            values: [
              { displayName: 'From', name: 'from', type: 'string', default: '' },
              { displayName: 'To',   name: 'to',   type: 'string', default: '' },
            ],
          },
        ],
      },
      {
        displayName: 'Output Field Name',
        name: 'outputField',
        type: 'string',
        default: 'result',
        description: 'Key name for the transformed value in the output item.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const method    = this.getNodeParameter('method',    i) as string;
      const url       = this.getNodeParameter('url',       i) as string;
      const timeout   = this.getNodeParameter('timeout',   i) as number;
      const useCredentials = this.getNodeParameter('useCredentials', i) as boolean;
      const headersRaw = (this.getNodeParameter('headers', i) as { header?: Array<{ name: string; value: string }> }).header ?? [];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      };

      for (const h of headersRaw) {
        if (h.name) headers[h.name] = h.value;
      }

      if (useCredentials) {
        const creds = await this.getCredentials('httpTransformApi');
        const baseUrl = (creds.baseUrl as string) ?? '';
        const headerName  = (creds.authHeaderName  as string) ?? 'Authorization';
        const headerValue = (creds.authHeaderValue as string) ?? '';
        if (headerValue) headers[headerName] = headerValue;
        if (baseUrl && !url.startsWith('http')) {
          // prepend base url
          (this as unknown as Record<string, unknown>)['_resolvedUrl'] = baseUrl.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
        }
      }

      let bodyData: Record<string, unknown> | undefined;
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const bodyStr = this.getNodeParameter('body', i, '{}') as string;
        try {
          bodyData = JSON.parse(bodyStr);
        } catch {
          throw new NodeOperationError(this.getNode(), 'Request Body is not valid JSON.', { itemIndex: i });
        }
      }

      // ---- HTTP request via n8n helper ----
      const response = await this.helpers.httpRequest({
        method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url,
        headers,
        body: bodyData,
        json: true,
        timeout,
      });

      // ---- Transform ----
      const transformMode = this.getNodeParameter('transformMode', i) as string;
      const outputField   = this.getNodeParameter('outputField', i) as string;

      let transformed: unknown = response;

      if (transformMode === 'extract') {
        const path = this.getNodeParameter('fieldPath', i) as string;
        transformed = getNestedValue(response, path);
      } else if (transformMode === 'filter') {
        const path         = this.getNodeParameter('fieldPath',   i) as string;
        const filterField  = this.getNodeParameter('filterField',  i) as string;
        const filterValue  = this.getNodeParameter('filterValue',  i) as string;
        const arr = getNestedValue(response, path);
        if (!Array.isArray(arr)) {
          throw new NodeOperationError(this.getNode(), `Path "${path}" did not resolve to an array.`, { itemIndex: i });
        }
        transformed = arr.filter((item: unknown) =>
          typeof item === 'object' && item !== null &&
          String((item as Record<string, unknown>)[filterField]) === filterValue
        );
      } else if (transformMode === 'rename') {
        const mappingsRaw = (this.getNodeParameter('keyMappings', i) as { mapping?: Array<{ from: string; to: string }> }).mapping ?? [];
        if (typeof response === 'object' && response !== null && !Array.isArray(response)) {
          const obj = { ...(response as Record<string, unknown>) };
          for (const m of mappingsRaw) {
            if (m.from in obj) {
              obj[m.to] = obj[m.from];
              delete obj[m.from];
            }
          }
          transformed = obj;
        }
      }

      returnData.push({
        json: { [outputField]: transformed },
        pairedItem: { item: i },
      });
    }

    return [returnData];
  }
}

// ---------------------------------------------------------------------------
// Utility: resolve dot-notation path
// ---------------------------------------------------------------------------

function getNestedValue(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce((current: unknown, key: string) => {
    if (current === null || current === undefined) return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}
