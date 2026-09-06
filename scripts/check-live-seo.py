import json,sys,urllib.request,urllib.error,urllib.parse,xml.etree.ElementTree as E,re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
base=sys.argv[1].rstrip('/')
canonical='https://www.notaryzhou.com'
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9','i':'http://www.google.com/schemas/sitemap-image/1.1'}
def fetch(path):
    r=urllib.request.urlopen(base+path,timeout=30)
    return r,r.read().decode()
class Page(HTMLParser):
    def __init__(self):super().__init__();self.in_schema=False;self.schema='';self.canonical=None;self.robots=''
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='script' and attrs.get('type')=='application/ld+json':self.in_schema=True
        if tag=='link' and attrs.get('rel')=='canonical':self.canonical=attrs['href']
        if tag=='meta' and attrs.get('name')=='robots':self.robots=attrs.get('content','')
    def handle_endtag(self,tag):
        if tag=='script':self.in_schema=False
    def handle_data(self,data):
        if self.in_schema:self.schema+=data
_,robots=fetch('/robots.txt')
assert [line for line in robots.splitlines() if line.startswith('Sitemap:')]==['Sitemap: '+canonical+'/sitemap-index.xml']
_,index=fetch('/sitemap-index.xml')
children=[n.text for n in E.fromstring(index).findall('s:sitemap/s:loc',ns)]
expected={canonical+'/en/notaries/sitemap.xml',canonical+'/articles/sitemap.xml',canonical+'/sitemap-0.xml'}
assert set(children)==expected and len(children)==3
all_urls=set(); groups={}
for child in children:
    path=urllib.parse.urlsplit(child).path
    response,xml=fetch(path)
    assert 'xml' in response.headers['Content-Type']
    tree=E.fromstring(xml)
    assert tree.tag=='{'+ns['s']+'}urlset'
    entries=tree.findall('s:url',ns)
    urls=[e.find('s:loc',ns).text for e in entries]
    assert len(urls)==len(set(urls)) and not all_urls.intersection(urls)
    assert all(url.startswith(canonical+'/') and not url.endswith('.xml') for url in urls)
    all_urls.update(urls);groups[path]=urls
    if path=='/en/notaries/sitemap.xml':
        assert len(urls)==100
        assert all(e.find('s:priority',ns).text=='0.0' for e in entries)
        assert all(e.find('s:lastmod',ns) is None for e in entries)
        pilot=json.loads((Path(__file__).resolve().parent.parent / 'src/data/notary-sitemap-pilot.json').read_text())
        assert set(url.split('/')[-2] for url in urls)==set(pilot['commissionNumbers'])
    if path=='/articles/sitemap.xml':
        assert len(urls)==30 and all(url.startswith(canonical+'/articles/') for url in urls)
        assert len(tree.findall('s:url/i:image/i:loc',ns))==29
        assert len(tree.findall('s:url/s:lastmod',ns))==29
    if path=='/sitemap-0.xml':
        assert {canonical+'/privacy/',canonical+'/en/privacy/'}.issubset(urls)
        assert len(urls)==7 and all('/articles/' not in url and '/notaries/' not in url for url in urls)
    print(path,len(urls),'valid entries',flush=True)

def check_notary(url):
    response,html=fetch(urllib.parse.urlsplit(url).path)
    page=Page();page.feed(html)
    assert page.canonical==url
    assert 'noindex' not in page.robots+response.headers.get('X-Robots-Tag','')
    person=next(item for item in json.loads(page.schema)['@graph'] if item['@type']=='Person')
    assert person['hasCredential']['identifier']['value']==url.split('/')[-2]
    assert person['name'] and 'Template preview' not in html
    return person['name']
with ThreadPoolExecutor(max_workers=4) as pool:
    names=list(pool.map(check_notary,groups['/en/notaries/sitemap.xml']))
print('All 100 selected profile pages return 200 with correct canonical and Person schema.',flush=True)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None
try:urllib.request.build_opener(NoRedirect()).open(base+'/notary-sitemap.xml');raise AssertionError('Expected redirect')
except urllib.error.HTTPError as error:assert error.code==301 and error.headers['Location']=='/en/notaries/sitemap.xml'
for i in range(1,15):
    try:fetch('/notary-sitemap-'+str(i)+'.xml');raise AssertionError('Legacy shard is still active')
    except urllib.error.HTTPError as error:assert error.code==410
fetch('/en/notaries/2455891/') # Non-pilot record stays available to users.
response,_=fetch('/en/notaries/preview/');assert 'noindex' in response.headers['X-Robots-Tag']
print('Old index redirects; all 14 old full-directory shards return 410; non-pilot lookup and preview settings remain correct.',flush=True)
