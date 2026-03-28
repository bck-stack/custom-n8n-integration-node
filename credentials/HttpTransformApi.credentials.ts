import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class HttpTransformApi implements ICredentialType {
  name = 'httpTransformApi';
  displayName = 'HTTP Transform API';
  documentationUrl = 'https://github.com/bck-stack/n8n-custom-node';

  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: '',
      placeholder: 'https://api.example.com',
      description: 'Base URL prepended to all requests made by this credential.',
    },
    {
      displayName: 'Auth Header Name',
      name: 'authHeaderName',
      type: 'string',
      default: 'Authorization',
    },
    {
      displayName: 'Auth Header Value',
      name: 'authHeaderValue',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      placeholder: 'Bearer your_token_here',
    },
  ];
}
