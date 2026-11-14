import zipfile, re
src='SA.docx'; dst='SA_print.docx'
z=zipfile.ZipFile(src); out=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED); counts={}
for e in z.infolist():
    b=z.read(e.filename)
    if e.filename=='word/document.xml':
        s=b.decode('utf8')
        for tag,val in [('{{Signature}}','______________________________'),('{{Date}}','______________________________'),('{{Signatory’s Title}}','Manager')]:
            counts[tag]=s.count(tag); s=s.replace(tag,val)
        import re
        def shrink(m):
            return re.sub(r'(<w:sz(?:Cs)? w:val=")(\d+)("/>)', lambda x: x.group(1)+str(round(int(x.group(2))*0.75) if int(x.group(2))>=60 else x.group(2))+x.group(3), m.group(0))
        s=re.sub(r'<wps:txbx>.*?</wps:txbx>', shrink, s, flags=re.S)
        b=s.encode('utf8')
    out.writestr(e,b)
out.close(); print(counts)
