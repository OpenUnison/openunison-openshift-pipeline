//    Copyright 2018 Tremolo Security, Inc.
// 
//    Licensed under the Apache License, Version 2.0 (the "License");
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
// 
//        http://www.apache.org/licenses/LICENSE-2.0
// 
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.

print("Loading CertUtils");
var CertUtils = Java.type("com.tremolosecurity.kubernetes.artifacts.util.CertUtils");

print("Creating openunison keystore");

ksPassword = inProp['unisonKeystorePassword'];
ouKs = Java.type("java.security.KeyStore").getInstance("PKCS12");
ouKs.load(null,ksPassword.toCharArray());

use_k8s_cm = true;

print("Generating client certificate for activemq");
amqCertInfo = {
    "serverName":"amq-client",
    "ou":"kubernetes",
    "o":"tremolo",
    "l":"cloud",
    "st":"cncf",
    "c":"ea",
    "caCert":false
}

var amqClientx509data = CertUtils.createCertificate(amqCertInfo);

CertUtils.saveX509ToKeystore(ouKs,ksPassword,"amq-client",amqClientx509data);

print("generate the amq keystore");

amqKS = Java.type("java.security.KeyStore").getInstance("PKCS12");
amqKS.load(null,ksPassword.toCharArray());

print("trusting the amq client cert");
amqKS.setCertificateEntry('trusted-amq-client',ouKs.getCertificate('amq-client'));

print("generating the server side certificate");

amqSrvCertInfo = {
  "serverName":"amq.openunison.svc.cluster.local",
  "ou":"kubernetes",
  "o":"tremolo",
  "l":"cloud",
  "st":"cncf",
  "c":"ea",
  "caCert":false
}

var amqSrvx509data = CertUtils.createCertificate(amqSrvCertInfo);

if (use_k8s_cm) {
  print("create csr for activemq");

  amqCsrReq = {
    "apiVersion": "certificates.k8s.io/v1beta1",
    "kind": "CertificateSigningRequest",
    "metadata": {
      "name": "amq.openunison.svc.cluster.local",
    },
    "spec": {
      "request": java.util.Base64.getEncoder().encodeToString(CertUtils.generateCSR(amqSrvx509data).getBytes("utf-8")),
      "usages": [
        "digital signature",
        "key encipherment",
        "server auth"
      ]
    }
  };

  print("Requesting amq certificate");
  apiResp = k8s.postWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests',JSON.stringify(amqCsrReq));

  print("Approving amq certificate");
  approveReq = JSON.parse(apiResp.data);
  approveReq.status.conditions = [
    {
        "type":"Approved",
        "reason":"OpenUnison Deployment",
        "message":"This CSR was approved by the OpenUnison artifact deployment job"
    }
  ];

  apiResp = k8s.putWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests/amq.openunison.svc.cluster.local/approval',JSON.stringify(approveReq));
  print("Retrieving amq certificate from API server");
  apiResp = k8s.callWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests/amq.openunison.svc.cluster.local','java.util.Base64.getDecoder().decode(JSON.parse(ws_response_json).status.certificate);check_ws_response=true;',10);
  print(apiResp.data);
  certResp = JSON.parse(apiResp.data);
  b64cert = certResp.status.certificate;
  CertUtils.importSignedCert(amqSrvx509data,b64cert);
} else {
  //not using CM, so store the amq cert directly into the openunison keystore
  ouKs.setCertificateEntry('trusted-amq-server',amqSrvx509data.getCertificate());
}

print("Saving amq certificate to amq keystore");
CertUtils.saveX509ToKeystore(amqKS,ksPassword,"broker",amqSrvx509data);







print("Generating openunison tls certificate");
certInfo = {
    "serverName":"openunison.openunison.svc.cluster.local",
    "ou":"kubernetes",
    "o":"tremolo",
    "l":"cloud",
    "st":"cncf",
    "c":"ea",
    "caCert":false
}

var x509data = CertUtils.createCertificate(certInfo);

if (use_k8s_cm) {
  print("Creating CSR for API server");



  csrReq = {
      "apiVersion": "certificates.k8s.io/v1beta1",
      "kind": "CertificateSigningRequest",
      "metadata": {
        "name": "openunison.openunison.svc.cluster.local",
      },
      "spec": {
        "request": java.util.Base64.getEncoder().encodeToString(CertUtils.generateCSR(x509data).getBytes("utf-8")),
        "usages": [
          "digital signature",
          "key encipherment",
          "server auth"
        ]
      }
    };

  print("Requesting certificate");
  apiResp = k8s.postWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests',JSON.stringify(csrReq));

  print("Approving certificate");
  approveReq = JSON.parse(apiResp.data);
  approveReq.status.conditions = [
      {
          "type":"Approved",
          "reason":"OpenUnison Deployment",
          "message":"This CSR was approved by the OpenUnison artifact deployment job"
      }
  ];

  apiResp = k8s.putWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests/openunison.openunison.svc.cluster.local/approval',JSON.stringify(approveReq));
  print("Retrieving certificate from API server");
  apiResp = k8s.callWS('/apis/certificates.k8s.io/v1beta1/certificatesigningrequests/openunison.openunison.svc.cluster.local','java.util.Base64.getDecoder().decode(JSON.parse(ws_response_json).status.certificate);check_ws_response=true;',10);
  print(apiResp.data);
  certResp = JSON.parse(apiResp.data);
  b64cert = certResp.status.certificate;
  CertUtils.importSignedCert(x509data,b64cert);
}

print("Saving certificate to keystore");
CertUtils.saveX509ToKeystore(ouKs,ksPassword,"unison-tls",x509data);
CertUtils.createKey(ouKs,"session-unison",ksPassword);
CertUtils.createKey(ouKs,"lastmile-oidc",ksPassword);

print("Generating OIDC Certificate");

certInfo = {
    "serverName":"unison-saml2-rp-sig",
    "ou":"kubernetes",
    "o":"tremolo",
    "l":"cloud",
    "st":"cncf",
    "c":"ea",
    "caCert":false
}

x509data = CertUtils.createCertificate(certInfo);
CertUtils.saveX509ToKeystore(ouKs,ksPassword,"unison-saml2-rp-sig",x509data);

rp_sig_cert_bytes = x509data.getCertificate();

print("Storing k8s certs");
ouKs.setCertificateEntry('k8s-master',k8s.getCertificate('k8s-master'));


//import metadata

fXmlFile = new java.io.File("/etc/extracerts/saml2-metadata.xml");
dbFactory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
dBuilder = dbFactory.newDocumentBuilder();
doc = dBuilder.parse(fXmlFile);

//get entity id
entityId = doc.getElementsByTagName("EntityDescriptor").item(0).getAttribute("entityID");

idp = doc.getElementsByTagName("IDPSSODescriptor").item(0);

singleLogoutURL = "";
ssoGetURL = "";
ssoPostURL = "";
sig_certs = [];
sig_cert_to_use = ""

current_cert_choice = null;


//single logout
slos = idp.getElementsByTagName("SingleLogoutService");

for (i = 0;i<slos.getLength();i++) {
    slo = slos.item(i);
    if (slo.getAttribute("Binding").equalsIgnoreCase("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect")) {
        singleLogoutURL = slo.getAttribute("Location");
    }
}

//single sign on
ssos = idp.getElementsByTagName("SingleSignOnService");

for (i = 0;i<ssos.getLength();i++) {
    sso = ssos.item(i);
    if (sso.getAttribute("Binding").equalsIgnoreCase("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect")) {
        ssoGetURL = sso.getAttribute("Location");
    } else if (sso.getAttribute("Binding").equalsIgnoreCase("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST")) {
        ssoPostURL = sso.getAttribute("Location");
    }
}

keys = idp.getElementsByTagName("KeyDescriptor");

for (i=0;i<keys.getLength();i++) {
    key = keys.item(i);

    if (key.getAttribute("use").equalsIgnoreCase("signing")) {
        sig_cert = key.getElementsByTagName("KeyInfo").item(0).getElementsByTagName("X509Data").item(0).getElementsByTagName("X509Certificate").item(0).getTextContent();
        sig_certs.push(sig_cert);
    }
}

if (sig_certs.length == 1) {
    current_cert_choice = com.tremolosecurity.kubernetes.artifacts.util.CertUtils.string2cert(sig_certs[0]);
} else {
    for (i=0;i<sig_certs.length;i++) {
        current_cert = com.tremolosecurity.kubernetes.artifacts.util.CertUtils.string2cert(sig_certs[i]);
        if (current_cert_choice == null) {
            current_cert_choice = current_cert;
        } else {
            if (current_cert_choice.getNotAfter().compareTo(current_cert.getNotAfter())  < 0  ) {
                current_cert_choice = current_cert;
            }
        }
    }
    
}


inProp['IDP_ENTITY_ID'] = entityId;
inProp['IDP_POST'] = ssoPostURL;
inProp['IDP_REDIR'] = ssoGetURL;
inProp['IDP_LOGOUT'] = singleLogoutURL;


ouKs.setCertificateEntry('idp-saml2-sig',current_cert_choice);


print("Create the openunison namespace");

ouNS = {
    "apiVersion":"v1",
    "kind":"Namespace",
    "metadata":{
        "creationTimestamp":null,
        "name":"openunison"
    },
    "spec":{},
    "status":{}
};

k8s.postWS('/api/v1/namespaces',JSON.stringify(ouNS));

if (inProp['REG_CRED_USER'] != null) {
  username = inProp['REG_CRED_USER'];
  password = inProp['REG_CRED_PASSWORD'];
  b64Creds = java.util.Base64.getEncoder().encodeToString((username + ':' + password).getBytes("UTF-8"));
  //TODO determine this from the builder image
  credServer = inProp['BUILDER_IMAGE'].substring(0,inProp['BUILDER_IMAGE'].indexOf('/'));
  print("Registry Server - '" + credServer + "'");


  docker_creds = {};
  docker_creds["auths"] = {};
  docker_creds["auths"][credServer] = {
    "username": username,
    "password": password,
    "email": "doesnotmatter@doesnotmatter.com",
    "auth": b64Creds
  };

  
  docker_secret = {
    "apiVersion": "v1",
    "data": {
      ".dockerconfigjson": java.util.Base64.getEncoder().encodeToString(JSON.stringify(docker_creds).getBytes("UTF-8"))
    },
    "kind": "Secret",
    "metadata": {
      "name": "redhat-registry",
      "namespace":"openunison"
    },
    "type": "kubernetes.io/dockerconfigjson"
  }

  res = k8s.postWS("/api/v1/namespaces/openunison/secrets",JSON.stringify(docker_secret));
  print(res.data);

}


print("import builder image");


import_builder_image = {
  "kind": "ImageStreamImport",
  "apiVersion": "image.openshift.io/v1",
  "metadata": {
    "name": "openunison-s2i",
    "namespace": "openunison",
    "creationTimestamp": null
  },
  "spec": {
    "import": true,
    "images": [
      {
        "from": {
          "kind": "DockerImage",
          "name": inProp['BUILDER_IMAGE']
        },
        "to": {
          "name": "latest"
        },
        "importPolicy": {},
        "referencePolicy": {
          "type": ""
        }
      }
    ]
  },
  "status": {}
};

res = k8s.postWS("/apis/image.openshift.io/v1/namespaces/openunison/imagestreamimports",JSON.stringify(import_builder_image));
print(res.data);


print("Create openunison service account");

k8s.postWS('/api/v1/namespaces/openunison/serviceaccounts',JSON.stringify({"apiVersion":"v1","kind":"ServiceAccount","metadata":{"creationTimestamp":null,"name":"openunison"}}));


print("Creating RBAC Bindings");

rbac = {
    "kind": "ClusterRoleBinding",
    "apiVersion": "rbac.authorization.k8s.io/v1",
    "metadata": {
      "name": "openunison-cluster-administrators"
    },
    "subjects": [
      {
        "kind": "Group",
        "name": "k8s-cluster-administrators",
        "apiGroup": "rbac.authorization.k8s.io"
      },
      {
        "kind": "ServiceAccount",
        "name": "openunison",
        "namespace": "openunison"
      }
    ],
    "roleRef": {
      "kind": "ClusterRole",
      "name": "cluster-admin",
      "apiGroup": "rbac.authorization.k8s.io"
    }
  };

k8s.postWS("/apis/rbac.authorization.k8s.io/v1/clusterrolebindings",JSON.stringify(rbac));

rbac = {
    "kind": "ClusterRole",
    "apiVersion": "rbac.authorization.k8s.io/v1",
    "metadata": {
      "name": "list-namespaces"
    },
    "rules": [
      {
        "apiGroups": [
          ""
        ],
        "resources": [
          "namespaces"
        ],
        "verbs": [
          "list"
        ]
      }
    ]
  };

k8s.postWS("/apis/rbac.authorization.k8s.io/v1/clusterroles",JSON.stringify(rbac));

rbac = {
    "kind": "ClusterRoleBinding",
    "apiVersion": "rbac.authorization.k8s.io/v1",
    "metadata": {
      "name": "openunison-cluster-list-namespaces"
    },
    "subjects": [
      {
        "kind": "Group",
        "name": "users",
        "apiGroup": "rbac.authorization.k8s.io"
      }
    ],
    "roleRef": {
      "kind": "ClusterRole",
      "name": "list-namespaces",
      "apiGroup": "rbac.authorization.k8s.io"
    }
  };


k8s.postWS("/apis/rbac.authorization.k8s.io/v1/clusterrolebindings",JSON.stringify(rbac));


//load quartz sql
print("pulling quartz sql");
quartzSQL = com.tremolosecurity.kubernetes.artifacts.util.NetUtil.downloadFile("file:///etc/input-maps/quartz.sql");
print("parsing quartz sql");
parsedSQL = com.tremolosecurity.kubernetes.artifacts.util.DbUtils.parseSQL(quartzSQL);
print("runnins quartz sql");
com.tremolosecurity.kubernetes.artifacts.util.DbUtils.runSQL(parsedSQL,inProp["OU_JDBC_DRIVER"],inProp["OU_JDBC_URL"],inProp["OU_JDBC_USER"],inProp["OU_JDBC_PASSWORD"]);

//create the ip mask
myIp = com.tremolosecurity.kubernetes.artifacts.util.NetUtil.whatsMyIP();
mask = myIp.substring(0,myIp.indexOf("."));
inProp["OU_QUARTZ_MASK"] = mask;

print("Create activemq config secret");
amqFileSecrets = {
  "apiVersion":"v1",
    "kind":"Secret",
    "type":"Opaque",
    "metadata": {
        "name":"amq-secrets",
        "namespace":"openunison"
    },
    "data":{
      "activemq.xml":"PCEtLQogICAgTGljZW5zZWQgdG8gdGhlIEFwYWNoZSBTb2Z0d2FyZSBGb3VuZGF0aW9uIChBU0YpIHVuZGVyIG9uZSBvciBtb3JlCiAgICBjb250cmlidXRvciBsaWNlbnNlIGFncmVlbWVudHMuICBTZWUgdGhlIE5PVElDRSBmaWxlIGRpc3RyaWJ1dGVkIHdpdGgKICAgIHRoaXMgd29yayBmb3IgYWRkaXRpb25hbCBpbmZvcm1hdGlvbiByZWdhcmRpbmcgY29weXJpZ2h0IG93bmVyc2hpcC4KICAgIFRoZSBBU0YgbGljZW5zZXMgdGhpcyBmaWxlIHRvIFlvdSB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wCiAgICAodGhlICJMaWNlbnNlIik7IHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aAogICAgdGhlIExpY2Vuc2UuICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXQKCiAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjAKCiAgICBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlCiAgICBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiAiQVMgSVMiIEJBU0lTLAogICAgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuCiAgICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kCiAgICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS4KLS0+CjwhLS0gU1RBUlQgU05JUFBFVDogZXhhbXBsZSAtLT4KPGJlYW5zCiAgeG1sbnM9Imh0dHA6Ly93d3cuc3ByaW5nZnJhbWV3b3JrLm9yZy9zY2hlbWEvYmVhbnMiCiAgeG1sbnM6eHNpPSJodHRwOi8vd3d3LnczLm9yZy8yMDAxL1hNTFNjaGVtYS1pbnN0YW5jZSIKICB4c2k6c2NoZW1hTG9jYXRpb249Imh0dHA6Ly93d3cuc3ByaW5nZnJhbWV3b3JrLm9yZy9zY2hlbWEvYmVhbnMgaHR0cDovL3d3dy5zcHJpbmdmcmFtZXdvcmsub3JnL3NjaGVtYS9iZWFucy9zcHJpbmctYmVhbnMueHNkCiAgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvc2NoZW1hL2NvcmUgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvc2NoZW1hL2NvcmUvYWN0aXZlbXEtY29yZS54c2QiPgoKICAgIDwhLS0gQWxsb3dzIHVzIHRvIHVzZSBzeXN0ZW0gcHJvcGVydGllcyBhcyB2YXJpYWJsZXMgaW4gdGhpcyBjb25maWd1cmF0aW9uIGZpbGUgLS0+CiAgICA8YmVhbiBjbGFzcz0ib3JnLnNwcmluZ2ZyYW1ld29yay5iZWFucy5mYWN0b3J5LmNvbmZpZy5Qcm9wZXJ0eVBsYWNlaG9sZGVyQ29uZmlndXJlciI+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImxvY2F0aW9ucyI+CiAgICAgICAgICAgIDx2YWx1ZT5maWxlOiR7YWN0aXZlbXEuY29uZn0vY3JlZGVudGlhbHMucHJvcGVydGllczwvdmFsdWU+CiAgICAgICAgPC9wcm9wZXJ0eT4KICAgIDwvYmVhbj4KCgoKICAgPCEtLSBBbGxvd3MgYWNjZXNzaW5nIHRoZSBzZXJ2ZXIgbG9nIC0tPgogICAgPGJlYW4gaWQ9ImxvZ1F1ZXJ5IiBjbGFzcz0iaW8uZmFicmljOC5pbnNpZ2h0LmxvZy5sb2c0ai5Mb2c0akxvZ1F1ZXJ5IgogICAgICAgICAgbGF6eS1pbml0PSJmYWxzZSIgc2NvcGU9InNpbmdsZXRvbiIKICAgICAgICAgIGluaXQtbWV0aG9kPSJzdGFydCIgZGVzdHJveS1tZXRob2Q9InN0b3AiPgogICAgPC9iZWFuPgoKICAgIDwhLS0KICAgICAgICBUaGUgPGJyb2tlcj4gZWxlbWVudCBpcyB1c2VkIHRvIGNvbmZpZ3VyZSB0aGUgQWN0aXZlTVEgYnJva2VyLgogICAgLS0+CiAgICA8YnJva2VyIHhtbG5zPSJodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9zY2hlbWEvY29yZSIgYnJva2VyTmFtZT0ibG9jYWxob3N0IiBkYXRhRGlyZWN0b3J5PSIke2FjdGl2ZW1xLmRhdGF9Ij4KCiAgICAgICAgPGRlc3RpbmF0aW9uUG9saWN5PgogICAgICAgICAgICA8cG9saWN5TWFwPgogICAgICAgICAgICAgIDxwb2xpY3lFbnRyaWVzPgogICAgICAgICAgICAgICAgPHBvbGljeUVudHJ5IHRvcGljPSI+IiA+CiAgICAgICAgICAgICAgICAgICAgPCEtLSBUaGUgY29uc3RhbnRQZW5kaW5nTWVzc2FnZUxpbWl0U3RyYXRlZ3kgaXMgdXNlZCB0byBwcmV2ZW50CiAgICAgICAgICAgICAgICAgICAgICAgICBzbG93IHRvcGljIGNvbnN1bWVycyB0byBibG9jayBwcm9kdWNlcnMgYW5kIGFmZmVjdCBvdGhlciBjb25zdW1lcnMKICAgICAgICAgICAgICAgICAgICAgICAgIGJ5IGxpbWl0aW5nIHRoZSBudW1iZXIgb2YgbWVzc2FnZXMgdGhhdCBhcmUgcmV0YWluZWQKICAgICAgICAgICAgICAgICAgICAgICAgIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICAgICAgICAgICAgICAgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvc2xvdy1jb25zdW1lci1oYW5kbGluZy5odG1sCgogICAgICAgICAgICAgICAgICAgIC0tPgogICAgICAgICAgICAgICAgICA8cGVuZGluZ01lc3NhZ2VMaW1pdFN0cmF0ZWd5PgogICAgICAgICAgICAgICAgICAgIDxjb25zdGFudFBlbmRpbmdNZXNzYWdlTGltaXRTdHJhdGVneSBsaW1pdD0iMTAwMCIvPgogICAgICAgICAgICAgICAgICA8L3BlbmRpbmdNZXNzYWdlTGltaXRTdHJhdGVneT4KICAgICAgICAgICAgICAgIDwvcG9saWN5RW50cnk+CiAgICAgICAgICAgICAgPC9wb2xpY3lFbnRyaWVzPgogICAgICAgICAgICA8L3BvbGljeU1hcD4KICAgICAgICA8L2Rlc3RpbmF0aW9uUG9saWN5PgoKCiAgICAgICAgPCEtLQogICAgICAgICAgICBUaGUgbWFuYWdlbWVudENvbnRleHQgaXMgdXNlZCB0byBjb25maWd1cmUgaG93IEFjdGl2ZU1RIGlzIGV4cG9zZWQgaW4KICAgICAgICAgICAgSk1YLiBCeSBkZWZhdWx0LCBBY3RpdmVNUSB1c2VzIHRoZSBNQmVhbiBzZXJ2ZXIgdGhhdCBpcyBzdGFydGVkIGJ5CiAgICAgICAgICAgIHRoZSBKVk0uIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICBodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9qbXguaHRtbAogICAgICAgIC0tPgogICAgICAgIDxtYW5hZ2VtZW50Q29udGV4dD4KICAgICAgICAgICAgPG1hbmFnZW1lbnRDb250ZXh0IGNyZWF0ZUNvbm5lY3Rvcj0iZmFsc2UiLz4KICAgICAgICA8L21hbmFnZW1lbnRDb250ZXh0PgoKICAgICAgICA8IS0tCiAgICAgICAgICAgIENvbmZpZ3VyZSBtZXNzYWdlIHBlcnNpc3RlbmNlIGZvciB0aGUgYnJva2VyLiBUaGUgZGVmYXVsdCBwZXJzaXN0ZW5jZQogICAgICAgICAgICBtZWNoYW5pc20gaXMgdGhlIEthaGFEQiBzdG9yZSAoaWRlbnRpZmllZCBieSB0aGUga2FoYURCIHRhZykuCiAgICAgICAgICAgIEZvciBtb3JlIGluZm9ybWF0aW9uLCBzZWU6CgogICAgICAgICAgICBodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9wZXJzaXN0ZW5jZS5odG1sCiAgICAgICAgLS0+CiAgICAgICAgPHBlcnNpc3RlbmNlQWRhcHRlcj4KICAgICAgIDxqZGJjUGVyc2lzdGVuY2VBZGFwdGVyCiAgICAgICAgICAgIGRhdGFEaXJlY3Rvcnk9IiR7YWN0aXZlbXEuYmFzZX0vZGF0YSIKICAgICAgICAgICAgZGF0YVNvdXJjZT0iI215c3FsLWRzIi8+CiAgICA8L3BlcnNpc3RlbmNlQWRhcHRlcj4KCiAgICAgICAKCgogICAgICAgICAgPCEtLQogICAgICAgICAgICBUaGUgc3lzdGVtVXNhZ2UgY29udHJvbHMgdGhlIG1heGltdW0gYW1vdW50IG9mIHNwYWNlIHRoZSBicm9rZXIgd2lsbAogICAgICAgICAgICB1c2UgYmVmb3JlIGRpc2FibGluZyBjYWNoaW5nIGFuZC9vciBzbG93aW5nIGRvd24gcHJvZHVjZXJzLiBGb3IgbW9yZSBpbmZvcm1hdGlvbiwgc2VlOgogICAgICAgICAgICBodHRwOi8vYWN0aXZlbXEuYXBhY2hlLm9yZy9wcm9kdWNlci1mbG93LWNvbnRyb2wuaHRtbAogICAgICAgICAgLS0+CiAgICAgICAgICA8c3lzdGVtVXNhZ2U+CiAgICAgICAgICAgIDxzeXN0ZW1Vc2FnZT4KICAgICAgICAgICAgICAgIDxtZW1vcnlVc2FnZT4KICAgICAgICAgICAgICAgICAgICA8bWVtb3J5VXNhZ2UgcGVyY2VudE9mSnZtSGVhcD0iNzAiIC8+CiAgICAgICAgICAgICAgICA8L21lbW9yeVVzYWdlPgogICAgICAgICAgICAgICAgPHN0b3JlVXNhZ2U+CiAgICAgICAgICAgICAgICAgICAgPHN0b3JlVXNhZ2UgbGltaXQ9IjEwMCBnYiIvPgogICAgICAgICAgICAgICAgPC9zdG9yZVVzYWdlPgogICAgICAgICAgICAgICAgPHRlbXBVc2FnZT4KICAgICAgICAgICAgICAgICAgICA8dGVtcFVzYWdlIGxpbWl0PSI1MCBnYiIvPgogICAgICAgICAgICAgICAgPC90ZW1wVXNhZ2U+CiAgICAgICAgICAgIDwvc3lzdGVtVXNhZ2U+CiAgICAgICAgPC9zeXN0ZW1Vc2FnZT4KCiAgICAgICAgPCEtLQogICAgICAgICAgICBUaGUgdHJhbnNwb3J0IGNvbm5lY3RvcnMgZXhwb3NlIEFjdGl2ZU1RIG92ZXIgYSBnaXZlbiBwcm90b2NvbCB0bwogICAgICAgICAgICBjbGllbnRzIGFuZCBvdGhlciBicm9rZXJzLiBGb3IgbW9yZSBpbmZvcm1hdGlvbiwgc2VlOgoKICAgICAgICAgICAgaHR0cDovL2FjdGl2ZW1xLmFwYWNoZS5vcmcvY29uZmlndXJpbmctdHJhbnNwb3J0cy5odG1sCiAgICAgICAgLS0+CiAgICAgICAgIDxzc2xDb250ZXh0PgogICAgICAgICAgICA8c3NsQ29udGV4dAogICAgICAgICAgICAgICAgICAgIGtleVN0b3JlPSIvZXRjL2FjdGl2ZW1xL2FtcS5wMTIiIGtleVN0b3JlUGFzc3dvcmQ9IiR7VExTX0tTX1BXRH0iCiAgICAgICAgICAgICAgICAgICAgdHJ1c3RTdG9yZT0iL2V0Yy9hY3RpdmVtcS9hbXEucDEyIiB0cnVzdFN0b3JlUGFzc3dvcmQ9IiR7VExTX0tTX1BXRH0iIHRydXN0U3RvcmVUeXBlPSJwa2NzMTIiIGtleVN0b3JlVHlwZT0icGtjczEyIi8+CiAgICAgICAgICAgIDwvc3NsQ29udGV4dD4KICAgICAgICA8dHJhbnNwb3J0Q29ubmVjdG9ycz4KICAgICAgICAgICAgPCEtLSBET1MgcHJvdGVjdGlvbiwgbGltaXQgY29uY3VycmVudCBjb25uZWN0aW9ucyB0byAxMDAwIGFuZCBmcmFtZSBzaXplIHRvIDEwME1CIC0tPgogICAgICAgICAgICA8dHJhbnNwb3J0Q29ubmVjdG9yIG5hbWU9Im9wZW53aXJlIiB1cmk9InNzbDovLzAuMC4wLjA6NjE2MTY/bWF4aW11bUNvbm5lY3Rpb25zPTEwMDAmYW1wO3dpcmVGb3JtYXQubWF4RnJhbWVTaXplPTEwNDg1NzYwMCZhbXA7bmVlZENsaWVudEF1dGg9dHJ1ZSIvPgogICAgICAgIDwvdHJhbnNwb3J0Q29ubmVjdG9ycz4KCiAgICAgICAgPCEtLSBkZXN0cm95IHRoZSBzcHJpbmcgY29udGV4dCBvbiBzaHV0ZG93biB0byBzdG9wIGpldHR5IC0tPgogICAgICAgIDxzaHV0ZG93bkhvb2tzPgogICAgICAgICAgICA8YmVhbiB4bWxucz0iaHR0cDovL3d3dy5zcHJpbmdmcmFtZXdvcmsub3JnL3NjaGVtYS9iZWFucyIgY2xhc3M9Im9yZy5hcGFjaGUuYWN0aXZlbXEuaG9va3MuU3ByaW5nQ29udGV4dEhvb2siIC8+CiAgICAgICAgPC9zaHV0ZG93bkhvb2tzPgoKICAgIDwvYnJva2VyPgoKICAgIDwhLS0KICAgICAgICBFbmFibGUgd2ViIGNvbnNvbGVzLCBSRVNUIGFuZCBBamF4IEFQSXMgYW5kIGRlbW9zCiAgICAgICAgVGhlIHdlYiBjb25zb2xlcyByZXF1aXJlcyBieSBkZWZhdWx0IGxvZ2luLCB5b3UgY2FuIGRpc2FibGUgdGhpcyBpbiB0aGUgamV0dHkueG1sIGZpbGUKCiAgICAgICAgVGFrZSBhIGxvb2sgYXQgJHtBQ1RJVkVNUV9IT01FfS9jb25mL2pldHR5LnhtbCBmb3IgbW9yZSBkZXRhaWxzCiAgICAtLT4KICAgIDwhLS0gPGltcG9ydCByZXNvdXJjZT0iZmlsZTovLy91c3IvbG9jYWwvYWN0aXZlbXEvY29uZi9qZXR0eS54bWwiLz4gLS0+CiAgICA8YmVhbiBpZD0ic2VjdXJpdHlMb2dpblNlcnZpY2UiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZWN1cml0eS5IYXNoTG9naW5TZXJ2aWNlIj4KICAgICAgICA8cHJvcGVydHkgbmFtZT0ibmFtZSIgdmFsdWU9IkFjdGl2ZU1RUmVhbG0iIC8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImNvbmZpZyIgdmFsdWU9IiR7YWN0aXZlbXEuY29uZn0vamV0dHktcmVhbG0ucHJvcGVydGllcyIgLz4KICAgIDwvYmVhbj4KCiAgICA8YmVhbiBpZD0ic2VjdXJpdHlDb25zdHJhaW50IiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkudXRpbC5zZWN1cml0eS5Db25zdHJhaW50Ij4KICAgICAgICA8cHJvcGVydHkgbmFtZT0ibmFtZSIgdmFsdWU9IkJBU0lDIiAvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJyb2xlcyIgdmFsdWU9InVzZXIsYWRtaW4iIC8+CiAgICAgICAgPCEtLSBzZXQgYXV0aGVudGljYXRlPWZhbHNlIHRvIGRpc2FibGUgbG9naW4gLS0+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImF1dGhlbnRpY2F0ZSIgdmFsdWU9ImZhbHNlIiAvPgogICAgPC9iZWFuPgogICAgPGJlYW4gaWQ9ImFkbWluU2VjdXJpdHlDb25zdHJhaW50IiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkudXRpbC5zZWN1cml0eS5Db25zdHJhaW50Ij4KICAgICAgICA8cHJvcGVydHkgbmFtZT0ibmFtZSIgdmFsdWU9IkJBU0lDIiAvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJyb2xlcyIgdmFsdWU9ImFkbWluIiAvPgogICAgICAgICA8IS0tIHNldCBhdXRoZW50aWNhdGU9ZmFsc2UgdG8gZGlzYWJsZSBsb2dpbiAtLT4KICAgICAgICA8cHJvcGVydHkgbmFtZT0iYXV0aGVudGljYXRlIiB2YWx1ZT0iZmFsc2UiIC8+CiAgICA8L2JlYW4+CiAgICA8YmVhbiBpZD0ic2VjdXJpdHlDb25zdHJhaW50TWFwcGluZyIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlY3VyaXR5LkNvbnN0cmFpbnRNYXBwaW5nIj4KICAgICAgICA8cHJvcGVydHkgbmFtZT0iY29uc3RyYWludCIgcmVmPSJzZWN1cml0eUNvbnN0cmFpbnQiIC8+CiAgICAgICAgPHByb3BlcnR5IG5hbWU9InBhdGhTcGVjIiB2YWx1ZT0iL2FwaS8qLC9hZG1pbi8qLCouanNwIiAvPgogICAgPC9iZWFuPgogICAgPGJlYW4gaWQ9ImFkbWluU2VjdXJpdHlDb25zdHJhaW50TWFwcGluZyIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlY3VyaXR5LkNvbnN0cmFpbnRNYXBwaW5nIj4KICAgICAgICA8cHJvcGVydHkgbmFtZT0iY29uc3RyYWludCIgcmVmPSJhZG1pblNlY3VyaXR5Q29uc3RyYWludCIgLz4KICAgICAgICA8cHJvcGVydHkgbmFtZT0icGF0aFNwZWMiIHZhbHVlPSIqLmFjdGlvbiIgLz4KICAgIDwvYmVhbj4KICAgIAogICAgPGJlYW4gaWQ9InJld3JpdGVIYW5kbGVyIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkucmV3cml0ZS5oYW5kbGVyLlJld3JpdGVIYW5kbGVyIj4KICAgICAgICA8cHJvcGVydHkgbmFtZT0icnVsZXMiPgogICAgICAgICAgICA8bGlzdD4KICAgICAgICAgICAgICAgIDxiZWFuIGlkPSJoZWFkZXIiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5yZXdyaXRlLmhhbmRsZXIuSGVhZGVyUGF0dGVyblJ1bGUiPgogICAgICAgICAgICAgICAgICA8cHJvcGVydHkgbmFtZT0icGF0dGVybiIgdmFsdWU9IioiLz4KICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9Im5hbWUiIHZhbHVlPSJYLUZSQU1FLU9QVElPTlMiLz4KICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9InZhbHVlIiB2YWx1ZT0iU0FNRU9SSUdJTiIvPgogICAgICAgICAgICAgICAgPC9iZWFuPgogICAgICAgICAgICA8L2xpc3Q+CiAgICAgICAgPC9wcm9wZXJ0eT4KICAgIDwvYmVhbj4KICAgIAoJPGJlYW4gaWQ9InNlY0hhbmRsZXJDb2xsZWN0aW9uIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLmhhbmRsZXIuSGFuZGxlckNvbGxlY3Rpb24iPgoJCTxwcm9wZXJ0eSBuYW1lPSJoYW5kbGVycyI+CgkJCTxsaXN0PgogICAJICAgICAgICAgICAgPHJlZiBiZWFuPSJyZXdyaXRlSGFuZGxlciIvPgoJCQkJPGJlYW4gY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LndlYmFwcC5XZWJBcHBDb250ZXh0Ij4KCQkJCQk8cHJvcGVydHkgbmFtZT0iY29udGV4dFBhdGgiIHZhbHVlPSIvYWRtaW4iIC8+CgkJCQkJPHByb3BlcnR5IG5hbWU9InJlc291cmNlQmFzZSIgdmFsdWU9IiR7YWN0aXZlbXEuaG9tZX0vd2ViYXBwcy9hZG1pbiIgLz4KCQkJCQk8cHJvcGVydHkgbmFtZT0ibG9nVXJsT25TdGFydCIgdmFsdWU9InRydWUiIC8+CgkJCQk8L2JlYW4+CgkJCQk8YmVhbiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkud2ViYXBwLldlYkFwcENvbnRleHQiPgoJCQkJCTxwcm9wZXJ0eSBuYW1lPSJjb250ZXh0UGF0aCIgdmFsdWU9Ii9hcGkiIC8+CgkJCQkJPHByb3BlcnR5IG5hbWU9InJlc291cmNlQmFzZSIgdmFsdWU9IiR7YWN0aXZlbXEuaG9tZX0vd2ViYXBwcy9hcGkiIC8+CgkJCQkJPHByb3BlcnR5IG5hbWU9ImxvZ1VybE9uU3RhcnQiIHZhbHVlPSJ0cnVlIiAvPgoJCQkJPC9iZWFuPgoJCQkJPGJlYW4gY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlcnZlci5oYW5kbGVyLlJlc291cmNlSGFuZGxlciI+CgkJCQkJPHByb3BlcnR5IG5hbWU9ImRpcmVjdG9yaWVzTGlzdGVkIiB2YWx1ZT0iZmFsc2UiIC8+CgkJCQkJPHByb3BlcnR5IG5hbWU9IndlbGNvbWVGaWxlcyI+CgkJCQkJCTxsaXN0PgoJCQkJCQkJPHZhbHVlPmluZGV4Lmh0bWw8L3ZhbHVlPgoJCQkJCQk8L2xpc3Q+CgkJCQkJPC9wcm9wZXJ0eT4KCQkJCQk8cHJvcGVydHkgbmFtZT0icmVzb3VyY2VCYXNlIiB2YWx1ZT0iJHthY3RpdmVtcS5ob21lfS93ZWJhcHBzLyIgLz4KCQkJCTwvYmVhbj4KCQkJCTxiZWFuIGlkPSJkZWZhdWx0SGFuZGxlciIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlcnZlci5oYW5kbGVyLkRlZmF1bHRIYW5kbGVyIj4KCQkJCQk8cHJvcGVydHkgbmFtZT0ic2VydmVJY29uIiB2YWx1ZT0iZmFsc2UiIC8+CgkJCQk8L2JlYW4+CgkJCTwvbGlzdD4KCQk8L3Byb3BlcnR5PgoJPC9iZWFuPiAgICAKICAgIDxiZWFuIGlkPSJzZWN1cml0eUhhbmRsZXIiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZWN1cml0eS5Db25zdHJhaW50U2VjdXJpdHlIYW5kbGVyIj4KICAgICAgICA8cHJvcGVydHkgbmFtZT0ibG9naW5TZXJ2aWNlIiByZWY9InNlY3VyaXR5TG9naW5TZXJ2aWNlIiAvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJhdXRoZW50aWNhdG9yIj4KICAgICAgICAgICAgPGJlYW4gY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnNlY3VyaXR5LmF1dGhlbnRpY2F0aW9uLkJhc2ljQXV0aGVudGljYXRvciIgLz4KICAgICAgICA8L3Byb3BlcnR5PgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJjb25zdHJhaW50TWFwcGluZ3MiPgogICAgICAgICAgICA8bGlzdD4KICAgICAgICAgICAgICAgIDxyZWYgYmVhbj0iYWRtaW5TZWN1cml0eUNvbnN0cmFpbnRNYXBwaW5nIiAvPgogICAgICAgICAgICAgICAgPHJlZiBiZWFuPSJzZWN1cml0eUNvbnN0cmFpbnRNYXBwaW5nIiAvPgogICAgICAgICAgICA8L2xpc3Q+CiAgICAgICAgPC9wcm9wZXJ0eT4KICAgICAgICA8cHJvcGVydHkgbmFtZT0iaGFuZGxlciIgcmVmPSJzZWNIYW5kbGVyQ29sbGVjdGlvbiIgLz4KICAgIDwvYmVhbj4KCiAgICA8YmVhbiBpZD0iY29udGV4dHMiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZXJ2ZXIuaGFuZGxlci5Db250ZXh0SGFuZGxlckNvbGxlY3Rpb24iPgogICAgPC9iZWFuPgoKICA8IS0tICA8YmVhbiBpZD0iamV0dHlQb3J0IiBjbGFzcz0ib3JnLmFwYWNoZS5hY3RpdmVtcS53ZWIuV2ViQ29uc29sZVBvcnQiIGluaXQtbWV0aG9kPSJzdGFydCI+CiAgICAgICAgICAgIAogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJob3N0IiB2YWx1ZT0iMC4wLjAuMCIvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJwb3J0IiB2YWx1ZT0iODE2MSIvPgogICAgPC9iZWFuIC0tPgoKICAgIDxiZWFuIGlkPSJTZXJ2ZXIiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZXJ2ZXIuU2VydmVyIgogICAgICAgIGRlc3Ryb3ktbWV0aG9kPSJzdG9wIj4KCiAgICAgICAgPHByb3BlcnR5IG5hbWU9ImhhbmRsZXIiPgogICAgICAgICAgICA8YmVhbiBpZD0iaGFuZGxlcnMiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZXJ2ZXIuaGFuZGxlci5IYW5kbGVyQ29sbGVjdGlvbiI+CiAgICAgICAgICAgICAgICA8cHJvcGVydHkgbmFtZT0iaGFuZGxlcnMiPgogICAgICAgICAgICAgICAgICAgIDxsaXN0PgogICAgICAgICAgICAgICAgICAgICAgICA8cmVmIGJlYW49ImNvbnRleHRzIiAvPgogICAgICAgICAgICAgICAgICAgICAgICA8cmVmIGJlYW49InNlY3VyaXR5SGFuZGxlciIgLz4KICAgICAgICAgICAgICAgICAgICA8L2xpc3Q+CiAgICAgICAgICAgICAgICA8L3Byb3BlcnR5PgogICAgICAgICAgICA8L2JlYW4+CiAgICAgICAgPC9wcm9wZXJ0eT4KCiAgICA8L2JlYW4+CgogICAgPGJlYW4gaWQ9Imludm9rZUNvbm5lY3RvcnMiIGNsYXNzPSJvcmcuc3ByaW5nZnJhbWV3b3JrLmJlYW5zLmZhY3RvcnkuY29uZmlnLk1ldGhvZEludm9raW5nRmFjdG9yeUJlYW4iPgogICAgCTxwcm9wZXJ0eSBuYW1lPSJ0YXJnZXRPYmplY3QiIHJlZj0iU2VydmVyIiAvPgogICAgCTxwcm9wZXJ0eSBuYW1lPSJ0YXJnZXRNZXRob2QiIHZhbHVlPSJzZXRDb25uZWN0b3JzIiAvPgogICAgCTxwcm9wZXJ0eSBuYW1lPSJhcmd1bWVudHMiPgogICAgCTxsaXN0PgogICAgICAgICAgIAk8YmVhbiBpZD0iQ29ubmVjdG9yIiBjbGFzcz0ib3JnLmVjbGlwc2UuamV0dHkuc2VydmVyLlNlcnZlckNvbm5lY3RvciI+CiAgICAgICAgICAgCQk8Y29uc3RydWN0b3ItYXJnIHJlZj0iU2VydmVyIiAvPgogICAgICAgICAgICAgICAgICAgIDwhLS0gc2VlIHRoZSBqZXR0eVBvcnQgYmVhbiAtLT4KICAgICAgICAgICAgICAgICAgIDwhLS0gcHJvcGVydHkgbmFtZT0iaG9zdCIgdmFsdWU9IiN7c3lzdGVtUHJvcGVydGllc1snamV0dHkuaG9zdCddfSIgLz4KICAgICAgICAgICAgICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJwb3J0IiB2YWx1ZT0iI3tzeXN0ZW1Qcm9wZXJ0aWVzWydqZXR0eS5wb3J0J119IiAvIC0tPgogICAgICAgICAgICAgICA8L2JlYW4+CiAgICAgICAgICAgICAgICA8IS0tCiAgICAgICAgICAgICAgICAgICAgRW5hYmxlIHRoaXMgY29ubmVjdG9yIGlmIHlvdSB3aXNoIHRvIHVzZSBodHRwcyB3aXRoIHdlYiBjb25zb2xlCiAgICAgICAgICAgICAgICAtLT4KICAgICAgICAgICAgICAgIDxiZWFuIGlkPSJTZWN1cmVDb25uZWN0b3IiIGNsYXNzPSJvcmcuZWNsaXBzZS5qZXR0eS5zZXJ2ZXIuU2VydmVyQ29ubmVjdG9yIj4KCQkJCQk8Y29uc3RydWN0b3ItYXJnIHJlZj0iU2VydmVyIiAvPgoJCQkJCTxjb25zdHJ1Y3Rvci1hcmc+CgkJCQkJCTxiZWFuIGlkPSJoYW5kbGVycyIgY2xhc3M9Im9yZy5lY2xpcHNlLmpldHR5LnV0aWwuc3NsLlNzbENvbnRleHRGYWN0b3J5Ij4KCQkJCQkJCgkJCQkJCQk8cHJvcGVydHkgbmFtZT0ia2V5U3RvcmVQYXRoIiB2YWx1ZT0iL2V0Yy9hY3RpdmVtcS9hbXEucDEyIiAvPgoJCQkJCQkJPHByb3BlcnR5IG5hbWU9ImtleVN0b3JlUGFzc3dvcmQiIHZhbHVlPSIke1RMU19LU19QV0R9IiAvPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPHByb3BlcnR5IG5hbWU9ImtleVN0b3JlVHlwZSIgdmFsdWU9InBrY3MxMiIgLz4KCiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8cHJvcGVydHkgbmFtZT0idHJ1c3RTdG9yZVBhdGgiIHZhbHVlPSIvZXRjL2FjdGl2ZW1xL2FtcS5wMTIiIC8+CgkJCQkJCQk8cHJvcGVydHkgbmFtZT0idHJ1c3RTdG9yZVBhc3N3b3JkIiB2YWx1ZT0iJHtUTFNfS1NfUFdEfSIgLz4KICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJ0cnVzdFN0b3JlVHlwZSIgdmFsdWU9InBrY3MxMiIgLz4KICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJuZWVkQ2xpZW50QXV0aCIgdmFsdWU9InRydWUiIC8+CgoJCQkJCQk8L2JlYW4+CgkJCQkJPC9jb25zdHJ1Y3Rvci1hcmc+CgkJCQkJPHByb3BlcnR5IG5hbWU9InBvcnQiIHZhbHVlPSI4MTYyIiAvPgoJCQkJPC9iZWFuPgogICAgICAgICAgICA8L2xpc3Q+CiAgICAJPC9wcm9wZXJ0eT4KICAgIDwvYmVhbj4KCgk8YmVhbiBpZD0iY29uZmlndXJlSmV0dHkiIGNsYXNzPSJvcmcuc3ByaW5nZnJhbWV3b3JrLmJlYW5zLmZhY3RvcnkuY29uZmlnLk1ldGhvZEludm9raW5nRmFjdG9yeUJlYW4iPgoJCTxwcm9wZXJ0eSBuYW1lPSJzdGF0aWNNZXRob2QiIHZhbHVlPSJvcmcuYXBhY2hlLmFjdGl2ZW1xLndlYi5jb25maWcuSnNwQ29uZmlndXJlci5jb25maWd1cmVKZXR0eSIgLz4KCQk8cHJvcGVydHkgbmFtZT0iYXJndW1lbnRzIj4KCQkJPGxpc3Q+CgkJCQk8cmVmIGJlYW49IlNlcnZlciIgLz4KCQkJCTxyZWYgYmVhbj0ic2VjSGFuZGxlckNvbGxlY3Rpb24iIC8+CgkJCTwvbGlzdD4KCQk8L3Byb3BlcnR5PgoJPC9iZWFuPgogICAgCiAgICA8YmVhbiBpZD0iaW52b2tlU3RhcnQiIGNsYXNzPSJvcmcuc3ByaW5nZnJhbWV3b3JrLmJlYW5zLmZhY3RvcnkuY29uZmlnLk1ldGhvZEludm9raW5nRmFjdG9yeUJlYW4iIAogICAgCWRlcGVuZHMtb249ImNvbmZpZ3VyZUpldHR5LCBpbnZva2VDb25uZWN0b3JzIj4KICAgIAk8cHJvcGVydHkgbmFtZT0idGFyZ2V0T2JqZWN0IiByZWY9IlNlcnZlciIgLz4KICAgIAk8cHJvcGVydHkgbmFtZT0idGFyZ2V0TWV0aG9kIiB2YWx1ZT0ic3RhcnQiIC8+ICAJCiAgICA8L2JlYW4+CgogICAgICAgIDwhLS0gc2V0dXAgbXlzcWwgYWNjZXNzIC0tPgogICAgPGJlYW4gaWQ9Im15c3FsLWRzIiBjbGFzcz0ib3JnLmFwYWNoZS5jb21tb25zLmRiY3AuQmFzaWNEYXRhU291cmNlIiBkZXN0cm95LW1ldGhvZD0iY2xvc2UiPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJkcml2ZXJDbGFzc05hbWUiIHZhbHVlPSIje3N5c3RlbUVudmlyb25tZW50WydKREJDX0RSSVZFUiddfSIvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJ1cmwiIHZhbHVlPSIke0pEQkNfVVJMfSIvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJ1c2VybmFtZSIgdmFsdWU9IiN7c3lzdGVtRW52aXJvbm1lbnRbJ0pEQkNfVVNFUiddfSIvPgogICAgICAgIDxwcm9wZXJ0eSBuYW1lPSJwYXNzd29yZCIgdmFsdWU9IiN7c3lzdGVtRW52aXJvbm1lbnRbJ0pEQkNfUEFTU1dPUkQnXX0iLz4KICAgICAgICA8cHJvcGVydHkgbmFtZT0icG9vbFByZXBhcmVkU3RhdGVtZW50cyIgdmFsdWU9InRydWUiLz4KICAgIDwvYmVhbj4KCjwvYmVhbnM+CjwhLS0gRU5EIFNOSVBQRVQ6IGV4YW1wbGUgLS0+",
      "amq.p12":CertUtils.encodeKeyStore(amqKS,ksPassword)
    }
}

k8s.postWS('/api/v1/namespaces/openunison/secrets',JSON.stringify(amqFileSecrets));

print("Create activemq env var secret");

amqEnvSecrets = {
  "apiVersion":"v1",
    "kind":"Secret",
    "type":"Opaque",
    "metadata": {
        "name":"amq-env-secrets",
        "namespace":"openunison"
    },
    "data":{
      "JDBC_DRIVER":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_DRIVER'].getBytes("UTF-8")),
      "JDBC_URL":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_URL'].getBytes("UTF-8")),
      "JDBC_USER":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_USER'].getBytes("UTF-8")),
      "JDBC_PASSWORD":java.util.Base64.getEncoder().encodeToString(inProp['OU_JDBC_PASSWORD'].getBytes("UTF-8")),
      "TLS_KS_PWD":java.util.Base64.getEncoder().encodeToString(ksPassword.getBytes("UTF-8"))
    }
}

k8s.postWS('/api/v1/namespaces/openunison/secrets',JSON.stringify(amqEnvSecrets));

print("Create OpenUnison Secret");


ouSecrets = {
    "apiVersion":"v1",
    "kind":"Secret",
    "type":"Opaque",
    "metadata": {
        "name":"openunison-secrets",
        "namespace":"openunison"
    },
    "data":{
      "openunison.yaml":"LS0tCm9wZW5fcG9ydDogODA4MApvcGVuX2V4dGVybmFsX3BvcnQ6IDgwCnNlY3VyZV9wb3J0OiA4NDQzCnNlY3VyZV9leHRlcm5hbF9wb3J0OiA0NDMKc2VjdXJlX2tleV9hbGlhczogInVuaXNvbi10bHMiCmZvcmNlX3RvX3NlY3VyZTogdHJ1ZQphY3RpdmVtcV9kaXI6ICIvdG1wL2FtcSIKcXVhcnR6X2RpcjogIi90bXAvcXVhcnR6IgpjbGllbnRfYXV0aDogbm9uZQphbGxvd2VkX2NsaWVudF9uYW1lczogW10KY2lwaGVyczoKLSBUTFNfUlNBX1dJVEhfUkM0XzEyOF9TSEEKLSBUTFNfUlNBX1dJVEhfQUVTXzEyOF9DQkNfU0hBCi0gVExTX1JTQV9XSVRIX0FFU18yNTZfQ0JDX1NIQQotIFRMU19SU0FfV0lUSF8zREVTX0VERV9DQkNfU0hBCi0gVExTX1JTQV9XSVRIX0FFU18xMjhfQ0JDX1NIQTI1NgotIFRMU19SU0FfV0lUSF9BRVNfMjU2X0NCQ19TSEEyNTYKcGF0aF90b19kZXBsb3ltZW50OiAiL3Vzci9sb2NhbC9vcGVudW5pc29uL3dvcmsiCnBhdGhfdG9fZW52X2ZpbGU6ICIvZXRjL29wZW51bmlzb24vb3UuZW52IgoK",
      "ou.env":k8s.encodeMap(inProp),
      "unisonKeyStore.p12":CertUtils.encodeKeyStore(ouKs,ksPassword)
    }
}

k8s.postWS('/api/v1/namespaces/openunison/secrets',JSON.stringify(ouSecrets));

print("Creating post deployment configmap");

print("Runing kubectl create");
k8s.kubectlCreate(k8s.processTemplate(deploymentTemplate,inProp));
print("kubectl complete");



ou_route = {
	"kind": "Route",
	"apiVersion": "route.openshift.io/v1",
	"id": "openunison-https",
	"metadata": {
		"name": "secure-openunison",
		"labels": {
			"application": "openunison"
		},
		"annotations": {
			"description": "Route for OpenUnison's https service."
		}
	},
	"spec": {
		"host": inProp['OU_HOST'],
		"port": {
			"targetPort": "secure"
		},
		"to": {
			"kind": "Service",
			"name": "secure-openunison"
		},
		"tls": {
			"termination": "reencrypt",
      "destinationCACertificate":CertUtils.exportCert(k8s.getCertificate('k8s-master'))
		}
	}
};

k8s.postWS('/apis/route.openshift.io/v1/namespaces/openunison/routes',JSON.stringify(ou_route));

ou_imagestream = {
	"kind": "ImageStream",
	"apiVersion": "image.openshift.io/v1",
	"metadata": {
		"name": "openunison",
		"labels": {
			"application": "openunison"
		}
	}
};

k8s.postWS('/apis/image.openshift.io/v1/namespaces/openunison/imagestreams',JSON.stringify(ou_imagestream));

ou_build = {
	"kind": "BuildConfig",
	"apiVersion": "build.openshift.io/v1",
	"metadata": {
		"name": "openunison",
		"labels": {
			"application": "openunison"
		}
	},
	"spec": {
		"source": {
			"type": "Git",
			"git": {
				"uri": "https://github.com/OpenUnison/openunison-openshift-saml2.git",
				"ref": "master"
			},
			"contextDir": "/"
		},
		"strategy": {
			"type": "Source",
			"sourceStrategy": {
				"env": [],
				"forcePull": true,
				"from": {
					"kind": "ImageStreamTag",
					"namespace": "openunison",
					"name": "openunison-s2i:latest"
				}
			}
		},
		"output": {
			"to": {
				"kind": "ImageStreamTag",
				"name": "openunison:latest"
			}
		},
		"triggers": [
			{
				"type": "ImageChange",
				"imageChange": {}
			},
			{
				"type": "ConfigChange"
			}
		]
	}
};

if (inProp['REG_CRED_USER'] != null) {
  ou_build.spec.strategy.sourceStrategy['pullSecret'] = {"name":"redhat-registry"};
}

k8s.postWS('/apis/build.openshift.io/v1/namespaces/openunison/buildconfigs',JSON.stringify(ou_build));

ou_deployment = {
	"kind": "DeploymentConfig",
	"apiVersion": "apps.openshift.io/v1",
	"metadata": {
		"name": "openunison",
		"labels": {
			"application": "openunison"
		}
	},
	"spec": {
		"strategy": {
			"type": "Recreate"
		},
		"triggers": [
			{
				"type": "ImageChange",
				"imageChangeParams": {
					"automatic": true,
					"containerNames": [
						"openunison"
					],
					"from": {
						"kind": "ImageStreamTag",
						"name": "openunison:latest"
					}
				}
			},
			{
				"type": "ConfigChange"
			}
		],
		"replicas": 1,
		"selector": {
			"deploymentConfig": "openunison"
		},
		"template": {
			"metadata": {
				"name": "openunison",
				"labels": {
					"deploymentConfig": "openunison",
					"application": "openunison"
				}
			},
			"spec": {
				"terminationGracePeriodSeconds": 60,
				"containers": [
					{
						"name": "openunison",
						"image": "openunison",
						"imagePullPolicy": "Always",
						"volumeMounts": [
							{
								"name": "secret-volume",
								"mountPath": "/etc/openunison",
								"readOnly": true
							}
						],
						"livenessProbe": {
							"exec": {
								"command": [
									"/usr/local/openunison/bin/check_alive.py"
								]
							},
							"initialDelaySeconds": 30,
							"timeoutSeconds": 10,
              "failureThreshold":10
						},
						"readinessProbe": {
							"exec": {
								"command": [
									"/usr/local/openunison/bin/check_alive.py"
								]
							},
							"initialDelaySeconds": 30,
							"timeoutSeconds": 10,
              "failureThreshold":10
						},
						"ports": [
							{
								"name": "http",
								"containerPort": 8080,
								"protocol": "TCP"
							},
							{
								"name": "https",
								"containerPort": 8443,
								"protocol": "TCP"
							}
						],
						"env": [
							{
								"name": "JAVA_OPTS",
								"value": "-Djava.awt.headless=true -Djava.security.egd=file:/dev/./urandom\n-DunisonEnvironmentFile=/etc/openunison/ou.env"
							}
						]
					}
        ],
        "serviceAccount":"openunison",
        "serviceAccountName":"openunison",
				"volumes": [
					{
						"name": "secret-volume",
						"secret": {
							"secretName": "openunison-secrets"
						}
					}
				]
			}
		}
	}
};

k8s.postWS('/apis/apps.openshift.io/v1/namespaces/openunison/deploymentconfigs',JSON.stringify(ou_deployment));



xmlMetaData =  '<EntityDescriptor ID="_10685acd-7df4-427e-b61e-68e4f6407c24" entityID="https://' + inProp['OU_HOST'] + '/auth/SAML2Auth" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">\n';
xmlMetaData += '  <SPSSODescriptor WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n';
xmlMetaData += '      <KeyDescriptor use="signing">\n';
xmlMetaData += '        <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">\n';
xmlMetaData += '              <X509Data>\n';
xmlMetaData += '                  <X509Certificate>\n' + new org.apache.commons.codec.binary.Base64(64).encodeToString(rp_sig_cert_bytes.getEncoded()) + '</X509Certificate>\n';
xmlMetaData += '              </X509Data>\n';
xmlMetaData += '          </KeyInfo>\n';
xmlMetaData += '      </KeyDescriptor>\n';
xmlMetaData += '      <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://' + inProp['OU_HOST'] + '/auth/SAML2Auth"/>\n';
xmlMetaData += '      <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</NameIDFormat>\n';
xmlMetaData += '      <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://' + inProp['OU_HOST'] + '/auth/SAML2Auth" index="0" isDefault="true"/>\n';
xmlMetaData += '      <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://' + inProp['OU_HOST'] + '/auth/SAML2Auth" index="1"/>\n';
xmlMetaData += '  </SPSSODescriptor>\n';
xmlMetaData += '</EntityDescriptor>';


post_deploy_instructions = "After the build is complete:\n" +
                           " 1.  In the same directory as your ansible inventory file, create a file called group_vars/OSEv3.yaml\n" +
                           " 2.  Add the following YAML to this file:\n" +
                           "openshift_master_identity_providers:\n" +
                           "- name: openunison\n" +
                           "  challenge: false\n" +
                           "  login: true\n" +
                           "  mappingMethod: claim\n" +
                           "  kind: OpenIDIdentityProvider\n" +
                           "  clientID: openshift\n" +
                           "  clientSecret: YOUR_SECRET\n" +
                           "  ca: /etc/origin/master/openunison_openid_ca.crt\n" +
                           "  claims:\n" +
                           "    id:\n" +
                           "    - sub\n" +
                           "    preferredUsername:\n" +
                           "    - preferred_username\n" + 
                           "    name:\n" +
                           "    - name\n" +
                           "    email:\n" +
                           "    - email\n" +
                           "  urls:\n" +
                           "    authorize: https://" + inProp["OU_HOST"] + "/auth/idp/OpenShiftIdP/auth\n" +
                           "    token: https://" + inProp["OU_HOST"] + "/auth/idp/OpenShiftIdP/token\n" +
                           "3.  In your inventory, set openshift_master_logout_url=https://" + inProp['OU_HOST'] + "/logout\n" +
                           "4.  Step 3 will NOT update the ConfigMap that controls this setting, so follow the instructions at https://docs.openshift.com/container-platform/3.11/install_config/web_console_customization.html#changing-the-logout-url\n" +
                           "5.  If you're router is using the default wildcard certificate generated by OpenShift, copy /etc/origin/master/ca.crt to /etc/origin/master/openunison_openid_ca.crt.  If using a 3rd party CA issued certificate, make sure to copy it to /etc/origin/master/openunison_openid_ca.crt on each master. \n" +
                           "6.  Run the openshift-ansible/playbooks/openshift-master/config.yml playbook\n" + 
                           "7.  Import the metadata generated in saml2-rp-metadata" 
                           



cfgMap = {
    "apiVersion":"v1",
    "kind":"ConfigMap",
    "metadata":{
        "name":"api-server-config",
        "namespace":"openunison"
    },
    "data":{
        "post-deploy-instructions":post_deploy_instructions,
        "openshift_idp_configuration":"",
        "saml2-rp-metadata":xmlMetaData
        
        //"deployment":java.util.Base64.getEncoder().encodeToString(k8s.processTemplate(deploymentTemplate,inProp).getBytes("UTF-8"))
    }
};

k8s.postWS('/api/v1/namespaces/openunison/configmaps',JSON.stringify(cfgMap));

print("Deleting cluster role binding");
k8s.deleteWS('/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/artifact-deployment');

print("Artifacts Created, to configure the API server run 'kubectl describe configmap api-server-config -n openunison'");