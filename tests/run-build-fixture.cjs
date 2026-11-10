const path=require('node:path'),{spawnSync}=require('node:child_process');
const fixture=path.join(__dirname,'build-fixture.cjs');
const result=spawnSync(process.execPath,[require.resolve('next/dist/bin/next'),'build'],{stdio:'inherit',env:{...process.env,FAP_QA_BUILD_FIXTURE:'1',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'https://qa-fixture.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_qa_fixture',SUPABASE_SECRET_KEY:'qa_fixture_not_a_real_key',NODE_OPTIONS:`${process.env.NODE_OPTIONS||''} --require=${JSON.stringify(fixture)}`}});
process.exit(result.status??1);
