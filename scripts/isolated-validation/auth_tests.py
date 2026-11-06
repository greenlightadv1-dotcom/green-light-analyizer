import json, os, re, sys, urllib.request, urllib.error, urllib.parse, time, http.client
API=os.environ["API_URL"]; ANON=os.environ["ANON_KEY"]; SR=os.environ["SERVICE_ROLE_KEY"]; MP=os.environ["MAILPIT_URL"]
def call(method, url, body=None, key=ANON, auth=None, follow=True):
    req=urllib.request.Request(url if url.startswith("http") else API+url, data=json.dumps(body).encode() if body is not None else None, method=method,
        headers={"apikey":key,"authorization":"Bearer "+(auth or key),"content-type":"application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            raw=r.read()
            try: return r.status, json.loads(raw or b"{}")
            except ValueError: return r.status, {"raw": raw[:200].decode(errors="replace")}
    except urllib.error.HTTPError as e:
        t=e.read()
        try: return e.code, json.loads(t)
        except Exception: return e.code, {"raw": t[:200].decode(errors="replace")}
results=[]
def rec(name, ok, detail): results.append((name, ok)); print(("PASS " if ok else "FAIL ")+name+" — "+detail)
# cleanup: the stray probe user from the previous run
c,b=call("GET","/auth/v1/admin/users?per_page=200",key=SR)
for u in b.get("users",[]):
    if u["email"]=="probe@example.invalid": call("DELETE","/auth/v1/admin/users/"+u["id"],key=SR); print("removed stray probe user")
ids=re.findall(r'P\("([0-9a-f-]{36})"', open(sys.argv[1]).read())
# existing users sign in
ok=0
for i in ids:
    c,b=call("POST","/auth/v1/token?grant_type=password",{"email":"u-"+i[:8]+"@example.invalid","password":"Test-Pass-12345!"})
    ok+= (c==200 and b.get("user",{}).get("id")==i)
rec("every existing user signs in with sign-up disabled", ok==len(ids), f"{ok}/{len(ids)}")
# password recovery: request, mail captured locally, link signs in
target="u-"+ids[6][:8]+"@example.invalid"
call("DELETE", MP+"/api/v1/messages")
c,b=call("POST","/auth/v1/recover",{"email":target})
time.sleep(2)
mc,mb=call("GET", MP+"/api/v1/messages")
msgs=[m for m in mb.get("messages",[]) if any(t.get("Address")==target for t in m.get("To",[]))]
rec("recovery email requested and captured by local Mailpit (not sent)", c==200 and len(msgs)==1, f"HTTP {c}, {len(msgs)} message(s) to {target}")
link=None
if msgs:
    mc,full=call("GET", MP+"/api/v1/message/"+msgs[0]["ID"])
    m=re.search(r'https?://[^\s"<>]+/auth/v1/verify\?[^\s"<>]+', full.get("Text","")+full.get("HTML",""))
    link=m.group(0).replace("&amp;","&") if m else None
if link:
    u=urllib.parse.urlparse(link); conn=http.client.HTTPConnection(u.hostname,u.port); conn.request("GET", u.path+"?"+u.query, headers={"apikey":ANON}); r=conn.getresponse(); loc=r.getheader("Location") or ""
    rec("recovery link verifies and issues a session", r.status in (302,303) and "access_token=" in loc and "type=recovery" in loc, f"HTTP {r.status}, redirect carries {'a recovery session' if 'access_token=' in loc else loc[:80]}")
    tok=urllib.parse.parse_qs(urllib.parse.urlparse(loc).fragment).get("access_token",[None])[0]
    if tok:
        c,b=call("PUT","/auth/v1/user",{"password":"Recovered-Pass-123!"},auth=tok)
        c2,b2=call("POST","/auth/v1/token?grant_type=password",{"email":target,"password":"Recovered-Pass-123!"})
        rec("recovered user sets a new password and signs in", c==200 and c2==200, f"update HTTP {c}, sign-in HTTP {c2}")
        call("PUT","/auth/v1/admin/users/"+ids[6],{"password":"Test-Pass-12345!"},key=SR)
else:
    rec("recovery link verifies and issues a session", False, "no link found")
# recovery for an unknown email creates no account
before=len(call("GET","/auth/v1/admin/users?per_page=200",key=SR)[1].get("users",[]))
c,b=call("POST","/auth/v1/recover",{"email":"nobody@example.invalid"})
after=len(call("GET","/auth/v1/admin/users?per_page=200",key=SR)[1].get("users",[]))
rec("recovery for an unknown email creates no account", after==before, f"HTTP {c}, users {before} -> {after}")
# admin (service role) still creates users with sign-up disabled
c,b=call("POST","/auth/v1/admin/users",{"email":"admin-created@example.invalid","password":"Strong-Pass-123!","email_confirm":True},key=SR)
rec("service-role admin createUser works with sign-up disabled", c==200 and b.get("id"), f"HTTP {c}")
if b.get("id"): call("DELETE","/auth/v1/admin/users/"+b["id"],key=SR)
# anon key cannot use the admin API
c,b=call("POST","/auth/v1/admin/users",{"email":"x@example.invalid","password":"Strong-Pass-123!"})
rec("anon key refused on the admin API", c in (401,403), f"HTTP {c}")
print(f"{sum(1 for _,o in results if o)}/{len(results)} passed")
