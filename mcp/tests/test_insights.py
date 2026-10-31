"""2026-10-31: exploration reads must not loosen existing write permissions."""
import json

import httpx
import pytest
import respx
from mcp.server.fastmcp import FastMCP

from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.tools import register_all
from duckquery_mcp.tools.insights import get_column_insights, discover_json_paths, generate_insight_query
from duckquery_mcp.tools.query import _truncate


NEW_TOOLS = {'get_column_insights', 'discover_json_paths', 'generate_insight_query'}


@pytest.mark.parametrize('mode', ['read-only', 'normal', 'full'])
@respx.mock
async def test_read_tools_registered_and_attach_ids_normalized(cfg, mode):
    selected = cfg.__class__(**{**cfg.__dict__, 'mode': mode})
    client = DuckQueryClient(selected)
    mcp = FastMCP('test')
    register_all(mcp, client, selected)
    names = {tool.name for tool in await mcp.list_tools()}
    assert NEW_TOOLS <= names
    assert {'run_sql', 'federated_query', 'duckquery_request'} <= names
    assert ('save_as_table' in names) == (mode != 'read-only')
    assert ('pivot' in names) == (mode != 'read-only')
    respx.get('http://127.0.0.1:48001/health').mock(return_value=httpx.Response(200, json={'status':'healthy'}))
    route = respx.post('http://127.0.0.1:48001/api/columns/insight-query').mock(return_value=httpx.Response(200, json={'success':True,'data':{'sql':'SELECT count(*) FROM m.t','pushdown':{'mode':'remote-count'}}}))
    fn = mcp._tool_manager.get_tool('generate_insight_query').fn
    result = await fn(table_name='m.t', metrics=[{'aggregation':'COUNT_ROWS','alias':'n'}], attach_databases=[{'alias':'m','connection_id':'db_fixture'}])
    sent = json.loads(route.calls.last.request.content)
    assert sent['attach_databases'] == [{'alias':'m','connection_id':'fixture'}]
    assert result['sql'] == 'SELECT count(*) FROM m.t'
    assert len(route.calls) == 1  # SQL generation never triggers /execute.
    await client._http.aclose()


@pytest.mark.parametrize('fn,path,kwargs', [
    (get_column_insights,'insights',{}),
    (discover_json_paths,'json-paths',{'column':'payload','filters':[{'column':'id','operator':'>=','value':2}]}),
    (generate_insight_query,'insight-query',{'extractions':[{'column':'payload','pointer':'/id','alias':'p_id','target_type':'VARCHAR'}]}),
])
@respx.mock
async def test_read_wrappers_preserve_inputs_and_backend_result(cfg, fn, path, kwargs):
    respx.get('http://127.0.0.1:48001/health').mock(return_value=httpx.Response(200,json={'status':'healthy'}))
    body={'paths':[],'sampled_rows':1} if path=='json-paths' else {'sql':'SELECT 1','columns':[]}
    route=respx.post('http://127.0.0.1:48001/api/columns/'+path).mock(return_value=httpx.Response(200,json={'success':True,'data':body}))
    client=DuckQueryClient(cfg)
    assert await fn(client,cfg,table_name='fixture',**kwargs)==body
    sent=json.loads(route.calls.last.request.content)
    for key,value in kwargs.items():assert sent[key]==value
    await client._http.aclose()


def test_optional_metadata_is_lossless_while_old_result_shape_stays_compatible(cfg):
    data={'columns':['n'],'data':[{'n':'9007199254740993.1234'}]*3,'row_count':3,
          'column_types':[{'name':'n','duckdb_type':'DECIMAL(20,4)'}],
          'pushdown':{'mode':'candidate','sources':2,'pushed_sources':1},'warnings':['candidate range only']}
    selected=cfg.__class__(**{**cfg.__dict__,'row_cap':2})
    result=_truncate(data,selected)
    assert len(result['rows'])==2 and result['truncated'] is True and result['row_count']==3
    for field in ('column_types','pushdown','warnings'):assert result[field]==data[field]
    assert result['rows'][0]['n']=='9007199254740993.1234'
    legacy=_truncate({'columns':['n'],'data':[{'n':1}],'row_count':1},cfg)
    assert set(legacy)=={'columns','rows','row_count','truncated'}
