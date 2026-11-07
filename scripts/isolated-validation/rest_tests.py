import json, os, urllib.request, urllib.error
API=os.environ["API_URL"]; ANON=os.environ["ANON_KEY"]
def call(method, path, body=None, auth=None, prefer=None):
    h={"apikey":ANON,"authorization":"Bearer "+(auth or ANON),"content-type":"application/json"}
    if prefer: h["prefer"]=prefer
    req=urllib.request.Request(API+path, data=json.dumps(body).encode() if body is not None else None, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r: raw=r.read(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw=e.read()
        try: return e.code, json.loads(raw)
        except ValueError: return e.code, raw[:120]
def tok(email):
    return call("POST","/auth/v1/token?grant_type=password",{"email":email,"password":"Test-Pass-12345!"})[1]["access_token"]
res=[]
def rec(n, ok, d): res.append(ok); print(("PASS " if ok else "FAIL ")+n+" — "+d)
me="96475964-f647-4da2-a2d5-0571879c1460"; other="373f4eb5-c8f5-4614-b1a3-8e699950eacc"
c,b=call("GET","/rest/v1/profiles?select=id,primary_email")
rec("anon reads no profiles over REST", c in (401,403) or b==[], f"HTTP {c}, {len(b) if isinstance(b,list) else b}")
t=tok("u-96475964@example.invalid")
c,b=call("GET","/rest/v1/profiles?select=id",auth=t)
rec("creator reads only their own profile", c==200 and [r['id'] for r in b]==[me], f"HTTP {c}, {len(b)} row(s)")
c,b=call("PATCH",f"/rest/v1/profiles?id=eq.{me}",{"role":"admin"},auth=t,prefer="return=representation")
rec("creator cannot change their own role", c in (401,403) or (c==200 and b==[]), f"HTTP {c} {b if not isinstance(b,list) else ''}"[:120])
c,b=call("PATCH",f"/rest/v1/profiles?id=eq.{me}",{"account_status":"active","inbound_alias":"hijack"},auth=t)
rec("creator cannot write server-only columns (account_status, inbound_alias)", c in (401,403), f"HTTP {c}")
c,b=call("PATCH",f"/rest/v1/profiles?id=eq.{me}",{"full_name":"Name 3e1825"},auth=t,prefer="return=representation")
rec("creator can still update their own display name", c==200 and len(b)==1, f"HTTP {c}")
c,b=call("PATCH",f"/rest/v1/profiles?id=eq.{other}",{"full_name":"x"},auth=t,prefer="return=representation")
rec("creator cannot update another profile", c in (401,403) or b==[], f"HTTP {c}, {b}")
c,b=call("POST","/rest/v1/deal_chats",{"creator_id":other,"sender_email":"security@greenlightadvs.com"},auth=t)
rec("client cannot insert deal rooms (0022)", c in (401,403), f"HTTP {c}")
c,b=call("POST","/rest/v1/messages",{"chat_id":"eec290f3-a9d6-4678-ba80-de4d27a51826","message_text":"wa.me/201012345678"},auth=t)
rec("client cannot insert unmasked messages (0022)", c in (401,403), f"HTTP {c}")
c,b=call("GET","/rest/v1/verification_documents?select=id",auth=t)
rec("creator reads no verification documents of others", c in (200,401,403) and (b==[] or c!=200), f"HTTP {c}, {b if not isinstance(b,list) else len(b)}")
c,b=call("POST","/rest/v1/rpc/consume_rate_limit",{"p_key":"x","p_limit":1,"p_window_seconds":60},auth=t)
rec("rate-limit function is service-role only", c in (401,403,404), f"HTTP {c}")
c,b=call("POST","/rest/v1/rpc/activation_claim",{"p_hash":"x"*64},auth=t)
rec("activation functions are not client-callable", c in (401,403,404), f"HTTP {c}")
tc=tok("u-8d2bd531@example.invalid")
c,b=call("GET","/rest/v1/deal_chats?select=id",auth=tc)
rec("company reads no creator deal rooms", c==200 and b==[], f"HTTP {c}, {len(b)}")
c,b=call("POST","/rest/v1/rpc/creator_directory",{},auth=tc)
rec("company directory works and exposes no contact fields", c==200 and len(b)>=1 and not any(k in b[0] for k in ("primary_email","inbound_alias","whatsapp_number")), f"HTTP {c}, {len(b)} rows, keys ok")
print(f"{sum(res)}/{len(res)} passed")
