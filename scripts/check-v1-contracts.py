#!/usr/bin/env python3
"""Offline design checks and synthetic samples. Never sends requests or installs packages."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/examples/v1'
spec = json.loads((BASE / 'openapi.json').read_text())
catalog = json.loads((BASE / 'mcp-tools.json').read_text())
fixtures = json.loads((BASE / 'fixtures.json').read_text())

if len(sys.argv) == 3 and sys.argv[1] == 'sample':
    case = next((x for x in fixtures['cases'] if x['name'] == sys.argv[2]), None)
    if case is None:
        sys.exit('Unknown sample; choices: ' + ', '.join(x['name'] for x in fixtures['cases']))
    print(json.dumps(case, ensure_ascii=False, indent=2))
    sys.exit(0)
if len(sys.argv) != 1:
    sys.exit('Usage: python3 scripts/check-v1-contracts.py [sample NAME]')
try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    sys.exit('NOT VALIDATED: Python jsonschema is unavailable. No dependency was installed.')

assert spec['openapi'] == '3.1.0'
assert spec['info']['version'] == 'sill-v1-draft1'
assert spec['servers'] == [{'url': 'https://api.sill.invalid/api/v1'}]
ops = {}
for path, methods in spec['paths'].items():
    for method, op in methods.items():
        if method not in ('get', 'post', 'patch', 'delete'):
            continue
        assert op['operationId'] not in ops
        ops[op['operationId']] = (path, method, op)
        if method != 'get':
            assert any(p['name'] == 'Idempotency-Key' and p['required'] for p in op['parameters'])

schemas = spec['components']['schemas']
def normalize(value):
    if isinstance(value, dict):
        return {k: (v.replace('#/components/schemas/', '#/$defs/') if k == '$ref' else normalize(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize(v) for v in value]
    return value

def validator(schema):
    root = {**normalize(schema), '$defs': normalize(schemas)}
    Draft202012Validator.check_schema(root)
    return Draft202012Validator(root, format_checker=FormatChecker())

for schema in schemas.values():
    validator(schema)

def check_refs(value):
    if isinstance(value, dict):
        if '$ref' in value:
            assert value['$ref'].startswith('#/components/schemas/'), value['$ref']
            assert value['$ref'].split('/')[-1] in schemas
        for v in value.values(): check_refs(v)
    elif isinstance(value, list):
        for v in value: check_refs(v)
check_refs(spec)

tools = {t['x-operationId']: t for t in catalog['tools']}
assert len(tools) == len(catalog['tools']) == 7
assert set(tools) == set(ops) - {'health'}
for name, tool in tools.items():
    path, method, op = ops[name]
    assert tool['name'] == 'sill_' + name
    assert tool['x-required-scope'] == op['x-required-scope']
    assert tool.get('x-result-scope') == op.get('x-result-scope')
    for schema in (tool['inputSchema'], tool['outputSchema']):
        Draft202012Validator.check_schema(schema)
        for key, value in schema.get('$defs', {}).items():
            assert value == normalize(schemas[key]), key
    input_schema = tool['inputSchema']
    expected = {}
    required = []
    for p in spec['paths'][path].get('parameters', []) + op.get('parameters', []):
        k = 'idempotency_key' if p['in'] == 'header' else p['name']
        expected[k] = normalize(p['schema'])
        if p['required']: required.append(k)
    if 'requestBody' in op:
        expected['body'] = normalize(op['requestBody']['content']['application/json']['schema'])
        required.append('body')
    assert input_schema['properties'] == expected, name
    assert set(input_schema['required']) == set(required), name
    response = next(v for k, v in op['responses'].items() if k.startswith('2'))
    assert tool['outputSchema']['$ref'] == normalize(response['content']['application/json']['schema'])['$ref']

for case in fixtures['cases']:
    tool = tools[case['operationId']]
    Draft202012Validator(tool['inputSchema'], format_checker=FormatChecker()).validate(case['arguments'])
    if case['status'] < 300:
        Draft202012Validator(tool['outputSchema'], format_checker=FormatChecker()).validate(case['response'])
    else:
        validator(schemas['Error']).validate(case['response'])
    if case['operationId'] == 'submitEvent':
        assert case['status'] == 202 and case['response']['outcome'] == 'pending'
    if 'delivery' in case['response'] and case['response']['outcome'] == 'succeeded':
        assert case['response']['result_revision'] is not None

# Negative controls ensure the checker actually rejects unsafe or incompatible examples.
for schema_name, invalid in [
    ('UpdateContent', {'changes': {'title': 'Missing revision'}}),
    ('CreateContent', {'type': 'note', 'title': 'bad', 'url': 'javascript:alert(1)'}),
    ('SubmitEvent', {'event_id': 'e', 'card_id': 'c', 'card_version': 1, 'action': 'delete_everything', 'destination_ref': 'a'}),
    ('Revision', -1),
    ('ResultMetadata', {'event_id': 'e', 'outcome': 'succeeded', 'summary': '', 'token': 'forbidden'})
]:
    assert list(validator(schemas[schema_name]).iter_errors(invalid)), schema_name

print(f'PASS: {len(ops)} HTTP operations, {len(tools)} MCP mappings, {len(fixtures["cases"])} fixtures, 5 negative controls.')
print('Design/schema consistency only; not a full OpenAPI conformance test or running-service acceptance.')
