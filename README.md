# OpenShift Pipeline Automation

This example pulls together GitLab, SonarQube and two OpenShift clusters to automate the deployment of projects into OpenShift and provide an automated way to deploy pipelines.  This repo isn't designed to be a turn-key solution but is instead meant to be an example of what is possible and as a starting point for your own workflow.

![OpenUnison Pipeline Demo Video](https://i.vimeocdn.com/video/855497103_200x150.jpg)

Short demo (~10 minutes) of this repository in action - https://vimeo.com/390996454



# Pre-requisites:

1. GitLab
2. MySQL/MariaDB (for OpenUnison's audit and state)
3. AWS SQS
4. SonarQube
5. Two OpenShift clusters (one for dev, and one for prod)
6. Email Server for notifications

# Deployment

## Deploy OpenUnison Operator into the DEV cluster

1. Create SQS queues:

```
export ACID="XXXXXX"
aws sqs create-queue --queue-name openunison-dlq.fifo --attributes FifoQueue=true,ContentBasedDeduplication=true
cat - > policy.json <<EOF
{
    "FifoQueue":"true",
    "ContentBasedDeduplication":"true",
    "RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:$ACID:openunison-dlq.fifo\",\"maxReceiveCount\":\"3\"}"
}
EOF
aws sqs create-queue --queue-name openunison-rebasequeue.fifo --attributes file://./policy.json
aws sqs create-queue --queue-name openunison-smtp.fifo --attributes file://./policy.json
aws sqs create-queue --queue-name openunison-tasks-1.fifo --attributes file://./policy.json
aws sqs create-queue --queue-name openunison-tasks-2.fifo --attributes file://./policy.json
aws iam create-user --user-name openunison.svc
aws iam attach-user-policy --user-name openunison.svc --policy-arn 'arn:aws:iam::aws:policy/AmazonSQSFullAccess'
aws iam create-access-key --user openunison.svc
```

2. Create a project called `openunison` and run :
```
oc adm groups new cluster-admins
oc adm policy add-cluster-role-to-group cluster-admin cluster-admins
oc adm policy add-cluster-role-to-user cluster-admin system:serviceaccount:openunison:openunison-orchestra
```

3. From the OperatorHub, add the OpenUnison operator to the `openunison` project
4. On the production cluster, create service accounts for transfering images:
```
oc new-project openunison
oc create sa openunison
oc adm policy add-cluster-role-to-user cluster-admin system:serviceaccount:openunison:openunison
oc adm groups new cluster-admins
oc adm policy add-cluster-role-to-group cluster-admin cluster-admins
```
5. Create a secret called `orchestra-secrets-source` fill in your own values:

```
kind: Secret
apiVersion: v1
metadata:
  name: orchestra-secrets-source
  namespace: openunison
data:
  AWS_SECRET: XXXXXXXXXX
  GITLAB_API_TOKEN: XXXXXXXXXX
  OU_JDBC_PASSWORD: XXXXXXXXXX
  OU_OIDC_OPENSHIFT_SECRET:XXXXXXXXXX
  PROD_SECRET: XXXXXXXXXX
  REG_CRED_PASSWORD: XXXXXXXXXX
  SMTP_PASSWORD: XXXXXXXXXX
  unisonKeystorePassword: XXXXXXXXXX
type: Opaque
```

6. Once the secret is deployed, Create an `OpenUnison` object based on the below template in the OpenUnison namespace:
```
apiVersion: openunison.tremolo.io/v1
kind: OpenUnison
metadata:
  name: orchestra
  namespace: openunison
spec:
  key_store:
    key_pairs:
      create_keypair_template:
        - name: ou
          value: k8s
        - name: o
          value: Tremolo Security
        - name: l
          value: Alexandria
        - name: st
          value: Virginia
        - name: c
          value: US
      keys:
        - create_data:
            ca_cert: true
            key_size: 2048
            server_name: openunison.openunison.svc.cluster.local
            sign_by_k8s_ca: false
            subject_alternative_names: []
          import_into_ks: keypair
          name: unison-tls
          tls_secret_name: unison-tls-secret
        - create_data:
            ca_cert: false
            key_size: 2048
            server_name: unison-saml2-rp-sig
            sign_by_k8s_ca: false
            subject_alternative_names: []
          import_into_ks: keypair
          name: unison-saml2-rp-sig
          tls_secret_name: unison-saml2-rp-sig
    static_keys:
      - name: session-unison
        version: 3
      - name: lastmile-oidc
        version: 1
    trusted_certificates:
      - name: prod-cert-1
        pem_data: |-
          -----BEGIN CERTIFICATE-----
          MIIELDCCAxSgAwIBAgIILHuC3oY6KrowDQYJKoZIhvcNAQELBQAwRDESMBAGA1UE
          CxMJb3BlbnNoaWZ0MS4wLAYDVQQDEyVrdWJlLWFwaXNlcnZlci1zZXJ2aWNlLW5l
          dHdvcmstc2lnbmVyMB4XDTIwMDIwNDE5MjMyN1oXDTIwMDMwNTE5MjMyOFowFTET
          MBEGA1UEAxMKMTcyLjMwLjAuMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC
          ggEBALPNNF+Wd+c8QKOEJykKnj1EKAhM767TK5WAtPpaKajOAw93dQptwlm3+s/x
          CyqEQr5FQQZu6m7ozunBCtWBLR6KOWBFpcDeaB/TqD0qNv7ZZWQYsy+v41jSfWEz
          yCVIUf8eqCw+GvBftZE3/DaZ26PnBnX86YrwxoQPVWunK3KTXcPehCI/QfLJ2J/k
          jqkAPxWxEhNjUGLry+yQq7EzhIv62+zZgo4xq1fJhTvDl0JPlqAi7PCU+NFx5TsF
          kcNxuqmhxPobPUlZy6qzFm4LQk7pBhpktcj9Dqs3YUkdnAdNBEAls4cd701q73NZ
          5w3BeEeEU4Inf0h3TBFBaEbiAIECAwEAAaOCAU8wggFLMA4GA1UdDwEB/wQEAwIF
          oDATBgNVHSUEDDAKBggrBgEFBQcDATAMBgNVHRMBAf8EAjAAMB0GA1UdDgQWBBRD
          /IY+ImdQrm945rJg50ET1X7T5TAfBgNVHSMEGDAWgBQ4CkmpzZwisbD8PBDfGoHc
          iSSRwzCB1QYDVR0RBIHNMIHKggprdWJlcm5ldGVzghJrdWJlcm5ldGVzLmRlZmF1
          bHSCFmt1YmVybmV0ZXMuZGVmYXVsdC5zdmOCJGt1YmVybmV0ZXMuZGVmYXVsdC5z
          dmMuY2x1c3Rlci5sb2NhbIIJb3BlbnNoaWZ0ghFvcGVuc2hpZnQuZGVmYXVsdIIV
          b3BlbnNoaWZ0LmRlZmF1bHQuc3ZjgiNvcGVuc2hpZnQuZGVmYXVsdC5zdmMuY2x1
          c3Rlci5sb2NhbIIKMTcyLjMwLjAuMYcErB4AATANBgkqhkiG9w0BAQsFAAOCAQEA
          hQBsVLZq5KElRW5yx2t3raykkNYKDwCx1lU5VwQS0aRx4b3l+sNm444MsxfdRl/u
          WuwCYFsrsY7Bp0Cp68b2ak24dQfyK6Mctntw6+9SX7D8oMbP56seH7LZRH1go+UZ
          /eHajag22zBNeIp/Yhy65tCESYgVAjjkTkNMttoJINNx7ccJ7jssq8qyeqx+yZ3W
          wE3axACCDrXWbrrS5OPwm80L50nVCF5a1ZiU1IiR9tSBLDjaJMLp9YMMORex+E7B
          qgbiGOfkFblOiI/zObQzJrs5/1ESmf5zmXSTqxX734yk0xfsgpFPkzRRiQC1+IoV
          XgyA6N5siu2R/KZuN9SKkw==
          -----END CERTIFICATE-----
      - name: prod-cert-2
        pem_data: |-
          -----BEGIN CERTIFICATE-----
          MIIDTDCCAjSgAwIBAgIIQMIIN6RxCVQwDQYJKoZIhvcNAQELBQAwRDESMBAGA1UE
          CxMJb3BlbnNoaWZ0MS4wLAYDVQQDEyVrdWJlLWFwaXNlcnZlci1zZXJ2aWNlLW5l
          dHdvcmstc2lnbmVyMB4XDTIwMDIwNDE5MDYwM1oXDTMwMDIwMTE5MDYwM1owRDES
          MBAGA1UECxMJb3BlbnNoaWZ0MS4wLAYDVQQDEyVrdWJlLWFwaXNlcnZlci1zZXJ2
          aWNlLW5ldHdvcmstc2lnbmVyMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
          AQEA7GifM7uVT23MPHhmXG8W1W1Q4IXWPPscIbFDWgf1hivkd0pqSO+n6pU6go6Z
          +mNb1odgt2XT6Gv/N2m22TfLu5/cGhrNS8yP3yukCNj0ujPDMPqVscZwcyoA836b
          oCUQnT2t7ULtD/iVuoeFBT2i+qTGOUAO/Mmn5bln5Yo70NaNNOGOdb+K4CQdHIhI
          YSrqOibdaV7uGC5KQeeZEbqpERrSqv+nwLspSqATUt42rlIJcHZS7Ct6zeJ9aoEx
          hX0c2QlE4QGHnCg19rr0fFrjpEeqPO6nTsRvvdrBF4X61TrXOcxJ1MRankIeiSJD
          XmRo67OY+aUsVhGg843mKpDlPwIDAQABo0IwQDAOBgNVHQ8BAf8EBAMCAqQwDwYD
          VR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUOApJqc2cIrGw/DwQ3xqB3IkkkcMwDQYJ
          KoZIhvcNAQELBQADggEBAGblML4fu9eZX4zYETtEIqV4WX+GXVKuVVOWIDlJcLvr
          iLJP38u50qJd+mtxtekl7WwnMpONAg/8wnKqDAwA2J/0Hh26iH0pqoImNFUin92T
          qxqLWLj8npLHiNDWtiQIAghuX9b+42Co1mP2H7iGPXe+n+Rub72wRwX/2e//8ndP
          ZHmMSKpkYO6wGtYCD/tOnKALub9CVEJuCu9NVKeNfOWR+I2+gPjJ6Sde43l2qGw3
          xoTlrjf8F0wvKVCrgBWBgX1uLzeS7OULYW33JGCs4TSHpcjyXJFu4yzlSz1cSREN
          mmB0RKc5SIyjvlEqj/4SsDLFE7Bug5quRr8WM7dZ5Ho=
          -----END CERTIFICATE-----
      - name: prod-cert-3
        pem_data: |-
          -----BEGIN CERTIFICATE-----
          MIIDMjCCAhqgAwIBAgIIUJ1g/YZ22c0wDQYJKoZIhvcNAQELBQAwNzESMBAGA1UE
          CxMJb3BlbnNoaWZ0MSEwHwYDVQQDExhrdWJlLWFwaXNlcnZlci1sYi1zaWduZXIw
          HhcNMjAwMjA0MTkwNjAzWhcNMzAwMjAxMTkwNjAzWjA3MRIwEAYDVQQLEwlvcGVu
          c2hpZnQxITAfBgNVBAMTGGt1YmUtYXBpc2VydmVyLWxiLXNpZ25lcjCCASIwDQYJ
          KoZIhvcNAQEBBQADggEPADCCAQoCggEBAMJAyRi4v05/iDp4H2Dqcy3i2greYt+n
          bVE5hO7U1NgW95pfpxMHRjOU/vh80GsBs92Ny2a51AA7Gq/2Bb1HXYFWeJYs8NMG
          mzzEcHd25AOGUsCmUyU13KG4rkCwH7FkQhdU/EVNhhnTwZKig8WgWuGKeOt3tpy4
          4eooF9dqKwhaFY7NHcqP6GsKg2ROK9p84Fofz1gMjvXCacI06WopPqf6g/BYjB4p
          OsFmgxNXf+3hhq2yQqPKR9uG9fXPp9KH056SOBDbJPCt1jnr6fmBBkKlyXenC/9m
          tIKyjhKo1m8kSoarqRumqX+CpzqyYAQwkVcDCf976A7J59DjQb0mo00CAwEAAaNC
          MEAwDgYDVR0PAQH/BAQDAgKkMA8GA1UdEwEB/wQFMAMBAf8wHQYDVR0OBBYEFLz1
          VoNpb4ROf8n7eBRemY0sCHCOMA0GCSqGSIb3DQEBCwUAA4IBAQByaux/R/ZIgs5A
          c4OBoTlBjg1dKI2y/e1Bh3hhpwzdvjru/niJolPeyU4Ayz4eymyIWfwzki1MtoII
          X9U+lrKzkyVhIMVztRzy+XBPOldjSm/4/cKu5RcBAbZyTGX6klsjJCgfIRFdb+WL
          561mwBHgDHsmQ2fK+NHTXRsTFwNmvJRlnWTgF5pNaCFCBOT0lFjYQTYJg+piXTYm
          SGVS6De5XZvrjQvpWb6KuJF0AtTC9MGSPh884CTfNUAqqCUZ0BCQh5csBmbIawuA
          0IVuNg+L64Str51wIqfqPv2P/gUnCh8QbG63zeW8qVMuhaNapftslyeqLerpd8rI
          Y8JiTDaA
          -----END CERTIFICATE-----
      - name: prod-cert-4
        pem_data: |-
          -----BEGIN CERTIFICATE-----
          MIIDQDCCAiigAwIBAgIIIcqHCGNMux8wDQYJKoZIhvcNAQELBQAwPjESMBAGA1UE
          CxMJb3BlbnNoaWZ0MSgwJgYDVQQDEx9rdWJlLWFwaXNlcnZlci1sb2NhbGhvc3Qt
          c2lnbmVyMB4XDTIwMDIwNDE5MDYwM1oXDTMwMDIwMTE5MDYwM1owPjESMBAGA1UE
          CxMJb3BlbnNoaWZ0MSgwJgYDVQQDEx9rdWJlLWFwaXNlcnZlci1sb2NhbGhvc3Qt
          c2lnbmVyMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2MIkv/Y0Sq5w
          83MR87QtKxc2FfJ4qq9gosYHH3zBS203Qn8dmOsJtCeSNLcCFiSS3XgU4BphsDds
          +Mkrau1RnC6JHAcxpdr1wCed54dJM740GMZa9ITHIlZX/5+WCd7uyBHk8mc5TfKH
          A70kS/KPl7zkOk3pq9n1rbymWXYytzuFq/Ha95eMoYySJm6pcrwdxgkhSfXsfw2B
          7yLucO/XnNg3X4vBRsPb5p9cIyvlfQjYk9DIouv4/UpfcpVA3dIw94aELrIY6oCv
          e6hD9ENjNDUdCBq8bwNeXyHk2XF3ewTocrscZCM/R6W+Taz4qkL/xzIsO6GtN2mg
          Rcu8bRyBlQIDAQABo0IwQDAOBgNVHQ8BAf8EBAMCAqQwDwYDVR0TAQH/BAUwAwEB
          /zAdBgNVHQ4EFgQUHH08v4Ot/Iv8imrEknGnWt3h0UMwDQYJKoZIhvcNAQELBQAD
          ggEBAAAznQU0b6/RANm3AGqRFbKWEgek/JywuD+HUYy/t1wXRvd4uVxmnzsMf7aH
          5BgfTpWciKm9IN/DQLR9ruKNXGdhCu4eMzzP3ahcGVKTq/ueiMa248rZdIhZHy2p
          gSxmw0wYP42o8ZtqPubPaw7zL9pp0GnBLfGXIAlFkdfC7fJkwzxzhQcWMveYD0jm
          Vg2VCrHBVVDyjwo1TMPzbMPmWUowOXTKuTiUf51Cwtbpjt+g/oNGS0i1Sz+dNQ6Q
          gk7Ip4yNFOl1jWZ6E1npyyFO7E9EEODK/+SBx5xp8Tfn6Y47jrCKYF2/GXscQPvL
          AdXUZoGGz5psyEQ3pQ+4cs39q5U=
          -----END CERTIFICATE-----
      - name: prod-cert-5
        pem_data: |-
          -----BEGIN CERTIFICATE-----
          MIIDTDCCAjSgAwIBAgIIQMIIN6RxCVQwDQYJKoZIhvcNAQELBQAwRDESMBAGA1UE
          CxMJb3BlbnNoaWZ0MS4wLAYDVQQDEyVrdWJlLWFwaXNlcnZlci1zZXJ2aWNlLW5l
          dHdvcmstc2lnbmVyMB4XDTIwMDIwNDE5MDYwM1oXDTMwMDIwMTE5MDYwM1owRDES
          MBAGA1UECxMJb3BlbnNoaWZ0MS4wLAYDVQQDEyVrdWJlLWFwaXNlcnZlci1zZXJ2
          aWNlLW5ldHdvcmstc2lnbmVyMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
          AQEA7GifM7uVT23MPHhmXG8W1W1Q4IXWPPscIbFDWgf1hivkd0pqSO+n6pU6go6Z
          +mNb1odgt2XT6Gv/N2m22TfLu5/cGhrNS8yP3yukCNj0ujPDMPqVscZwcyoA836b
          oCUQnT2t7ULtD/iVuoeFBT2i+qTGOUAO/Mmn5bln5Yo70NaNNOGOdb+K4CQdHIhI
          YSrqOibdaV7uGC5KQeeZEbqpERrSqv+nwLspSqATUt42rlIJcHZS7Ct6zeJ9aoEx
          hX0c2QlE4QGHnCg19rr0fFrjpEeqPO6nTsRvvdrBF4X61TrXOcxJ1MRankIeiSJD
          XmRo67OY+aUsVhGg843mKpDlPwIDAQABo0IwQDAOBgNVHQ8BAf8EBAMCAqQwDwYD
          VR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUOApJqc2cIrGw/DwQ3xqB3IkkkcMwDQYJ
          KoZIhvcNAQELBQADggEBAGblML4fu9eZX4zYETtEIqV4WX+GXVKuVVOWIDlJcLvr
          iLJP38u50qJd+mtxtekl7WwnMpONAg/8wnKqDAwA2J/0Hh26iH0pqoImNFUin92T
          qxqLWLj8npLHiNDWtiQIAghuX9b+42Co1mP2H7iGPXe+n+Rub72wRwX/2e//8ndP
          ZHmMSKpkYO6wGtYCD/tOnKALub9CVEJuCu9NVKeNfOWR+I2+gPjJ6Sde43l2qGw3
          xoTlrjf8F0wvKVCrgBWBgX1uLzeS7OULYW33JGCs4TSHpcjyXJFu4yzlSz1cSREN
          mmB0RKc5SIyjvlEqj/4SsDLFE7Bug5quRr8WM7dZ5Ho=
          -----END CERTIFICATE-----
      - name: prod-cert-6
        pem_data: |-
          -----BEGIN CERTIFICATE-----
          MIIDkDCCAnigAwIBAgIBATANBgkqhkiG9w0BAQsFADBZMVcwVQYDVQQDDE5vcGVu
          c2hpZnQta3ViZS1hcGlzZXJ2ZXItb3BlcmF0b3JfbG9jYWxob3N0LXJlY292ZXJ5
          LXNlcnZpbmctc2lnbmVyQDE1ODA4NDQyMDQwHhcNMjAwMjA0MTkyMzI0WhcNMzAw
          MjAxMTkyMzI1WjBZMVcwVQYDVQQDDE5vcGVuc2hpZnQta3ViZS1hcGlzZXJ2ZXIt
          b3BlcmF0b3JfbG9jYWxob3N0LXJlY292ZXJ5LXNlcnZpbmctc2lnbmVyQDE1ODA4
          NDQyMDQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDI06MdjoFe1wRx
          0KsCrkt9cMQpyqs0XSiA85mkAL6cF5YlGnRL52lxzPXX2fHYD+v4SvmzpaPGynkN
          WwjEHiL4lWsufbFe1ZKpRZMkhA2uQ8h0MdBDcLbh6kqsnVA+JattEtI5NexxsmHW
          y6M+fMyESjDhVv4fwwOGRxPpC1Dh5jromQeonmUKCSyhyP0aItQoQta0fkGpEtWY
          aJfm3exsE1gq+FudMeFXe1AfcO/Vh045MZ9AYxJ6+FfQe3L2LueB2/5bxfCDnUkI
          IGHOMChYUYYckyiWA/y66wUK5hjZvbOaA+lMopvJr3ZckwKSDzg7ifL4XBCRj2dW
          6ZhflyWnAgMBAAGjYzBhMA4GA1UdDwEB/wQEAwICpDAPBgNVHRMBAf8EBTADAQH/
          MB0GA1UdDgQWBBSogjzPUH4mAHgJKorFL8j891/QFjAfBgNVHSMEGDAWgBSogjzP
          UH4mAHgJKorFL8j891/QFjANBgkqhkiG9w0BAQsFAAOCAQEAI/QGVp2sEinSnxHB
          BEEViodd4l9ioUVpZnNe9XJEME2HQdE05yhSd5VuCXsFrSLlHNArZnZ6RjMmMw8u
          5UA19zK0wcZrOU8G8c1bPfcnBsripOqPSX5kNfxWYcfvoMchiaOLr7Xghbag+6kM
          dMWbwEM/vPdJh3urQ8sG5S3wlXA3hoyMJwL7/zdL5uhM7rPJoAElarOgU22QME25
          0OizhkeC4IFm2gkResTU7/Ek4HH4zuN5YzL3PbEUHk9Fmp6VZ6rBdLjFbugqigMk
          DHaRHir/EgQgto89z/GchDu2TBtscBYDQ/jwcQHdNY/3qr9ddS3/cZ/6V9xstFYu
          xKsBaQ==
          -----END CERTIFICATE-----
      - name: prod-cert-7
        pem_data: |-
          -----BEGIN CERTIFICATE-----
          MIIC7TCCAdWgAwIBAgIBATANBgkqhkiG9w0BAQsFADAmMSQwIgYDVQQDDBtpbmdy
          ZXNzLW9wZXJhdG9yQDE1ODA4NDQ1MTMwHhcNMjAwMjA0MTkyODMzWhcNMjIwMjAz
          MTkyODM0WjAmMSQwIgYDVQQDDBtpbmdyZXNzLW9wZXJhdG9yQDE1ODA4NDQ1MTMw
          ggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDKcGJkKNWyLSQcOQTLtcMV
          ZCCk0njjy04sx7nmcnpwuDWxkbNeS5+zJ/SqFM9pv49QkiIN3sKuCQjPp709ILTS
          bNZsQoSUJRIYU1fp+wcsX1LUvIFgcq9Bzpgrb5PPw8NP/h4Ipta6NLDA1mNvyHOV
          rvIXQslGB8IIqlzG1/vkehHPjHRf5E2VR3K+/Vsh5qQkXnsfKOTcwU8szwg4SNdv
          jVKfk7+XpySiCr9ChNgwwtAiiKYT63+9eV5MPIPDdystuDghJ7aex2aUPzahk47z
          4hgXuxKB9Ss0A/BQncRapj6f96O/iuSDiU46cBYIS4LsOsASmJwqMpvPZ++t/49v
          AgMBAAGjJjAkMA4GA1UdDwEB/wQEAwICpDASBgNVHRMBAf8ECDAGAQH/AgEAMA0G
          CSqGSIb3DQEBCwUAA4IBAQBdotTbBsFzueetrd8W9ini3Xy2taCqDxAgorZFDtg8
          45P9rP2S94crcLKYPGeBP32TeMxiZKBLaliLzRrZyH/9w7JinbM8p5R2Mm1w3PYW
          m4MU15aQuvNnRhzz3KvvEmyXDVc4uCe1Ic594Zg6AnzqJUJz7ZGIsx0Ur/tC30Nh
          8HbR8Tpf4U74SI3cgtxAO11zYF6vEo7PBKz72aqh2/vjx8d+wgxhamRHxCiSelgA
          T1Zx2vv3mksuBMg7m9Jn1gp8H7IouQeM4HmgbZ2AB788RXEDiXmAnwR+ojfthvSm
          k8laPb73h+uljyWQuRhhq8cpIsPhMRCfFY5fd1M+SF8G
          -----END CERTIFICATE-----
  activemq_image: 'registry.connect.redhat.com/tremolosecurity/activemq:latest'
  enable_activemq: false
  non_secret_data:
    - name: REG_CRED_USER
      value: XXXX
    - name: OPENSHIFT_CONSOLE_URL
      value: 'https://console-openshift-console.apps.devopsdev.tremolo.dev'
    - name: OU_HIBERNATE_DIALECT
      value: org.hibernate.dialect.MySQL5InnoDBDialect
    - name: OU_JDBC_DRIVER
      value: com.mysql.jdbc.Driver
    - name: OU_JDBC_URL
      value: >-
        jdbc:mysql://mariadb-101-centos7.openunison-mariadb.svc.cluster.local/unison
    - name: OU_JDBC_USER
      value: unison
    - name: OU_JDBC_VALIDATION
      value: SELECT 1
    - name: OU_OIDC_OPENSHIFT_REIDRECT
      value: >-
        https://oauth-openshift.apps.devopsdev.tremolo.dev/oauth2callback/openunison
    - name: OU_QUARTZ_DIALECT
      value: org.quartz.impl.jdbcjobstore.StdJDBCDelegate
    - name: OU_QUARTZ_MASK
      value: '10'
    - name: SESSION_INACTIVITY_TIMEOUT_SECONDS
      value: '900'
    - name: SMTP_FROM
      value: donotreply@tremolosecurity.com
    - name: SMTP_HOST
      value: email-smtp.us-east-1.amazonaws.com
    - name: SMTP_PORT
      value: '587'
    - name: SMTP_TLS
      value: 'true'
    - name: SMTP_USER
      value: XXXXX
    - name: OU_OIDC_GITLAB_REIDRECT
      value: >-
        https://gitlab.apps.devopsdev.tremolo.dev/users/auth/openid_connect/callback
    - name: GITLAB_URL
      value: 'https://gitlab.apps.devopsdev.tremolo.dev'
    - name: AWS_KEY
      value: XXXXX
    - name: JENKINS_URL
      value: 'https://jenkins-jenkins.apps.devopsdev.tremolo.dev'
    - name: OU_OIDC_SONARQUBE_REIDRECT
      value: 'https://sonarqube.apps.devopsdev.tremolo.dev/oauth2/callback/oidc'
    - name: OPENSHIFT_CONSOLE_PROD_URL
      value: 'https://console-openshift-console.apps.devopsprod.tremolo.dev'
    - name: OU_OIDC_OPENSHIFT_PROD_REIDRECT
      value: >-
        https://oauth-openshift.apps.devopsprod.tremolo.dev/oauth2callback/openunison
    - name: OPENSHIFT_PROD_API_URL
      value: 'https://api.devopsprod.tremolo.dev:6443'
    - name: OPENSHIFT_DEV_REGISTRY_HOST
      value: ocp-registry.apps.devopsdev.tremolo.dev
    - name: SONARQUBE_URL
      value: 'https://sonarqube.apps.devopsdev.tremolo.dev'
    - name: OPENSHIFT_API_HOST
      value: 'api.devopsdev.tremolo.dev:6443'
    - name: DEV_DNS_SUFFIX
      value: devopsdev.tremolo.dev
    - name: PROD_DNS_SUFFIX
      value: devopsprod.tremolo.dev
    - name: GITLAB_API_URL
      value: 'https://gitlab.apps.devopsdev.tremolo.dev'
    - name: GITLAB_ORG
      value: devops.comtest
  hosts:
    - ingress_name: openunison
      names:
        - env_var: OU_HOST
          name: orchestra.apps.devopsdev.tremolo.dev
  dest_secret: orchestra
  saml_remote_idp: []
  openunison_network_configuration:
    open_external_port: 80
    force_to_secure: true
    secure_key_alias: unison-tls
    ciphers:
      - TLS_RSA_WITH_RC4_128_SHA
      - TLS_RSA_WITH_AES_128_CBC_SHA
      - TLS_RSA_WITH_AES_256_CBC_SHA
      - TLS_RSA_WITH_3DES_EDE_CBC_SHA
      - TLS_RSA_WITH_AES_128_CBC_SHA256
      - TLS_RSA_WITH_AES_256_CBC_SHA256
    secure_port: 8443
    quartz_dir: /tmp/quartz
    allowed_client_names: []
    secure_external_port: 443
    path_to_deployment: /usr/local/openunison/work
    open_port: 8080
    path_to_env_file: /etc/openunison/ou.env
    activemq_dir: /tmp/amq
    client_auth: none
  source_secret: orchestra-secrets-source
  openshift:
    builder_image: registry.connect.redhat.com/tremolosecurity/openunison-s2i-10
    git:
      branch: master
      dir: /
      repo: >-
        git@host:infrastructure/openunison.git
  secret_data:
    - unisonKeystorePassword
    - REG_CRED_PASSWORD
    - OU_JDBC_PASSWORD
    - OU_OIDC_OPENSHIFT_SECRET
    - SMTP_PASSWORD
    - AWS_SECRET
    - PROD_SECRET
    - GITLAB_API_TOKEN
  run_sql: >-
    # By: Ron Cordell - roncordell

    #  I didn't see this anywhere, so I thought I'd post it here. This is the
    script from Quartz to create the tables in a MySQL database, modified to use
    INNODB instead of MYISAM.



    # make sure you have UTF-8 collaction for best .NET interoperability

    # CREATE DATABASE quartznet CHARACTER SET utf8mb4 COLLATE
    utf8mb4_unicode_ci;


    DROP TABLE IF EXISTS QRTZ_FIRED_TRIGGERS;

    DROP TABLE IF EXISTS QRTZ_PAUSED_TRIGGER_GRPS;

    DROP TABLE IF EXISTS QRTZ_SCHEDULER_STATE;

    DROP TABLE IF EXISTS QRTZ_LOCKS;

    DROP TABLE IF EXISTS QRTZ_SIMPLE_TRIGGERS;

    DROP TABLE IF EXISTS QRTZ_SIMPROP_TRIGGERS;

    DROP TABLE IF EXISTS QRTZ_CRON_TRIGGERS;

    DROP TABLE IF EXISTS QRTZ_BLOB_TRIGGERS;

    DROP TABLE IF EXISTS QRTZ_TRIGGERS;

    DROP TABLE IF EXISTS QRTZ_JOB_DETAILS;

    DROP TABLE IF EXISTS QRTZ_CALENDARS;


    CREATE TABLE QRTZ_JOB_DETAILS(

    SCHED_NAME VARCHAR(120) NOT NULL,

    JOB_NAME VARCHAR(200) NOT NULL,

    JOB_GROUP VARCHAR(200) NOT NULL,

    DESCRIPTION VARCHAR(250) NULL,

    JOB_CLASS_NAME VARCHAR(250) NOT NULL,

    IS_DURABLE BOOLEAN NOT NULL,

    IS_NONCONCURRENT BOOLEAN NOT NULL,

    IS_UPDATE_DATA BOOLEAN NOT NULL,

    REQUESTS_RECOVERY BOOLEAN NOT NULL,

    JOB_DATA BLOB NULL,

    PRIMARY KEY (SCHED_NAME,JOB_NAME,JOB_GROUP))

    ENGINE=InnoDB;


    CREATE TABLE QRTZ_TRIGGERS (

    SCHED_NAME VARCHAR(120) NOT NULL,

    TRIGGER_NAME VARCHAR(200) NOT NULL,

    TRIGGER_GROUP VARCHAR(200) NOT NULL,

    JOB_NAME VARCHAR(200) NOT NULL,

    JOB_GROUP VARCHAR(200) NOT NULL,

    DESCRIPTION VARCHAR(250) NULL,

    NEXT_FIRE_TIME BIGINT(19) NULL,

    PREV_FIRE_TIME BIGINT(19) NULL,

    PRIORITY INTEGER NULL,

    TRIGGER_STATE VARCHAR(16) NOT NULL,

    TRIGGER_TYPE VARCHAR(8) NOT NULL,

    START_TIME BIGINT(19) NOT NULL,

    END_TIME BIGINT(19) NULL,

    CALENDAR_NAME VARCHAR(200) NULL,

    MISFIRE_INSTR SMALLINT(2) NULL,

    JOB_DATA BLOB NULL,

    PRIMARY KEY (SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP),

    FOREIGN KEY (SCHED_NAME,JOB_NAME,JOB_GROUP)

    REFERENCES QRTZ_JOB_DETAILS(SCHED_NAME,JOB_NAME,JOB_GROUP))

    ENGINE=InnoDB;


    CREATE TABLE QRTZ_SIMPLE_TRIGGERS (

    SCHED_NAME VARCHAR(120) NOT NULL,

    TRIGGER_NAME VARCHAR(200) NOT NULL,

    TRIGGER_GROUP VARCHAR(200) NOT NULL,

    REPEAT_COUNT BIGINT(7) NOT NULL,

    REPEAT_INTERVAL BIGINT(12) NOT NULL,

    TIMES_TRIGGERED BIGINT(10) NOT NULL,

    PRIMARY KEY (SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP),

    FOREIGN KEY (SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP)

    REFERENCES QRTZ_TRIGGERS(SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP))

    ENGINE=InnoDB;


    CREATE TABLE QRTZ_CRON_TRIGGERS (

    SCHED_NAME VARCHAR(120) NOT NULL,

    TRIGGER_NAME VARCHAR(200) NOT NULL,

    TRIGGER_GROUP VARCHAR(200) NOT NULL,

    CRON_EXPRESSION VARCHAR(120) NOT NULL,

    TIME_ZONE_ID VARCHAR(80),

    PRIMARY KEY (SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP),

    FOREIGN KEY (SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP)

    REFERENCES QRTZ_TRIGGERS(SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP))

    ENGINE=InnoDB;


    CREATE TABLE QRTZ_SIMPROP_TRIGGERS
      (          
        SCHED_NAME VARCHAR(120) NOT NULL,
        TRIGGER_NAME VARCHAR(200) NOT NULL,
        TRIGGER_GROUP VARCHAR(200) NOT NULL,
        STR_PROP_1 VARCHAR(512) NULL,
        STR_PROP_2 VARCHAR(512) NULL,
        STR_PROP_3 VARCHAR(512) NULL,
        INT_PROP_1 INT NULL,
        INT_PROP_2 INT NULL,
        LONG_PROP_1 BIGINT NULL,
        LONG_PROP_2 BIGINT NULL,
        DEC_PROP_1 NUMERIC(13,4) NULL,
        DEC_PROP_2 NUMERIC(13,4) NULL,
        BOOL_PROP_1 BOOLEAN NULL,
        BOOL_PROP_2 BOOLEAN NULL,
        TIME_ZONE_ID VARCHAR(80) NULL,
        PRIMARY KEY (SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP),
        FOREIGN KEY (SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP) 
        REFERENCES QRTZ_TRIGGERS(SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP))
    ENGINE=InnoDB;


    CREATE TABLE QRTZ_BLOB_TRIGGERS (

    SCHED_NAME VARCHAR(120) NOT NULL,

    TRIGGER_NAME VARCHAR(200) NOT NULL,

    TRIGGER_GROUP VARCHAR(200) NOT NULL,

    BLOB_DATA BLOB NULL,

    PRIMARY KEY (SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP),

    INDEX (SCHED_NAME,TRIGGER_NAME, TRIGGER_GROUP),

    FOREIGN KEY (SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP)

    REFERENCES QRTZ_TRIGGERS(SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP))

    ENGINE=InnoDB;


    CREATE TABLE QRTZ_CALENDARS (

    SCHED_NAME VARCHAR(120) NOT NULL,

    CALENDAR_NAME VARCHAR(200) NOT NULL,

    CALENDAR BLOB NOT NULL,

    PRIMARY KEY (SCHED_NAME,CALENDAR_NAME))

    ENGINE=InnoDB;


    CREATE TABLE QRTZ_PAUSED_TRIGGER_GRPS (

    SCHED_NAME VARCHAR(120) NOT NULL,

    TRIGGER_GROUP VARCHAR(200) NOT NULL,

    PRIMARY KEY (SCHED_NAME,TRIGGER_GROUP))

    ENGINE=InnoDB;


    CREATE TABLE QRTZ_FIRED_TRIGGERS (

    SCHED_NAME VARCHAR(120) NOT NULL,

    ENTRY_ID VARCHAR(140) NOT NULL,

    TRIGGER_NAME VARCHAR(200) NOT NULL,

    TRIGGER_GROUP VARCHAR(200) NOT NULL,

    INSTANCE_NAME VARCHAR(200) NOT NULL,

    FIRED_TIME BIGINT(19) NOT NULL,

    SCHED_TIME BIGINT(19) NOT NULL,

    PRIORITY INTEGER NOT NULL,

    STATE VARCHAR(16) NOT NULL,

    JOB_NAME VARCHAR(200) NULL,

    JOB_GROUP VARCHAR(200) NULL,

    IS_NONCONCURRENT BOOLEAN NULL,

    REQUESTS_RECOVERY BOOLEAN NULL,

    PRIMARY KEY (SCHED_NAME,ENTRY_ID))

    ENGINE=InnoDB;


    CREATE TABLE QRTZ_SCHEDULER_STATE (

    SCHED_NAME VARCHAR(120) NOT NULL,

    INSTANCE_NAME VARCHAR(200) NOT NULL,

    LAST_CHECKIN_TIME BIGINT(19) NOT NULL,

    CHECKIN_INTERVAL BIGINT(19) NOT NULL,

    PRIMARY KEY (SCHED_NAME,INSTANCE_NAME))

    ENGINE=InnoDB;


    CREATE TABLE QRTZ_LOCKS (

    SCHED_NAME VARCHAR(120) NOT NULL,

    LOCK_NAME VARCHAR(40) NOT NULL,

    PRIMARY KEY (SCHED_NAME,LOCK_NAME))

    ENGINE=InnoDB;


    CREATE INDEX IDX_QRTZ_J_REQ_RECOVERY ON
    QRTZ_JOB_DETAILS(SCHED_NAME,REQUESTS_RECOVERY);

    CREATE INDEX IDX_QRTZ_J_GRP ON QRTZ_JOB_DETAILS(SCHED_NAME,JOB_GROUP);


    CREATE INDEX IDX_QRTZ_T_J ON QRTZ_TRIGGERS(SCHED_NAME,JOB_NAME,JOB_GROUP);

    CREATE INDEX IDX_QRTZ_T_JG ON QRTZ_TRIGGERS(SCHED_NAME,JOB_GROUP);

    CREATE INDEX IDX_QRTZ_T_C ON QRTZ_TRIGGERS(SCHED_NAME,CALENDAR_NAME);

    CREATE INDEX IDX_QRTZ_T_G ON QRTZ_TRIGGERS(SCHED_NAME,TRIGGER_GROUP);

    CREATE INDEX IDX_QRTZ_T_STATE ON QRTZ_TRIGGERS(SCHED_NAME,TRIGGER_STATE);

    CREATE INDEX IDX_QRTZ_T_N_STATE ON
    QRTZ_TRIGGERS(SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP,TRIGGER_STATE);

    CREATE INDEX IDX_QRTZ_T_N_G_STATE ON
    QRTZ_TRIGGERS(SCHED_NAME,TRIGGER_GROUP,TRIGGER_STATE);

    CREATE INDEX IDX_QRTZ_T_NEXT_FIRE_TIME ON
    QRTZ_TRIGGERS(SCHED_NAME,NEXT_FIRE_TIME);

    CREATE INDEX IDX_QRTZ_T_NFT_ST ON
    QRTZ_TRIGGERS(SCHED_NAME,TRIGGER_STATE,NEXT_FIRE_TIME);

    CREATE INDEX IDX_QRTZ_T_NFT_MISFIRE ON
    QRTZ_TRIGGERS(SCHED_NAME,MISFIRE_INSTR,NEXT_FIRE_TIME);

    CREATE INDEX IDX_QRTZ_T_NFT_ST_MISFIRE ON
    QRTZ_TRIGGERS(SCHED_NAME,MISFIRE_INSTR,NEXT_FIRE_TIME,TRIGGER_STATE);

    CREATE INDEX IDX_QRTZ_T_NFT_ST_MISFIRE_GRP ON
    QRTZ_TRIGGERS(SCHED_NAME,MISFIRE_INSTR,NEXT_FIRE_TIME,TRIGGER_GROUP,TRIGGER_STATE);


    CREATE INDEX IDX_QRTZ_FT_TRIG_INST_NAME ON
    QRTZ_FIRED_TRIGGERS(SCHED_NAME,INSTANCE_NAME);

    CREATE INDEX IDX_QRTZ_FT_INST_JOB_REQ_RCVRY ON
    QRTZ_FIRED_TRIGGERS(SCHED_NAME,INSTANCE_NAME,REQUESTS_RECOVERY);

    CREATE INDEX IDX_QRTZ_FT_J_G ON
    QRTZ_FIRED_TRIGGERS(SCHED_NAME,JOB_NAME,JOB_GROUP);

    CREATE INDEX IDX_QRTZ_FT_JG ON QRTZ_FIRED_TRIGGERS(SCHED_NAME,JOB_GROUP);

    CREATE INDEX IDX_QRTZ_FT_T_G ON
    QRTZ_FIRED_TRIGGERS(SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP);

    CREATE INDEX IDX_QRTZ_FT_TG ON
    QRTZ_FIRED_TRIGGERS(SCHED_NAME,TRIGGER_GROUP);


    DROP TABLE IF EXISTS ACTIVEMQ_ACKS;

    DROP TABLE IF EXISTS ACTIVEMQ_LOCK;

    DROP TABLE IF EXISTS ACTIVEMQ_MSGS;


    CREATE TABLE `ACTIVEMQ_ACKS` (
      `CONTAINER` varchar(250) NOT NULL,
      `SUB_DEST` varchar(250) DEFAULT NULL,
      `CLIENT_ID` varchar(250) NOT NULL,
      `SUB_NAME` varchar(250) NOT NULL,
      `SELECTOR` varchar(250) DEFAULT NULL,
      `LAST_ACKED_ID` bigint(20) DEFAULT NULL,
      `PRIORITY` bigint(20) NOT NULL DEFAULT '5',
      `XID` varchar(250) DEFAULT NULL,
      PRIMARY KEY (`CONTAINER`,`CLIENT_ID`,`SUB_NAME`,`PRIORITY`),
      KEY `ACTIVEMQ_ACKS_XIDX` (`XID`)
    );


    CREATE TABLE `ACTIVEMQ_LOCK` (
      `ID` bigint(20) NOT NULL,
      `TIME` bigint(20) DEFAULT NULL,
      `BROKER_NAME` varchar(250) DEFAULT NULL,
      PRIMARY KEY (`ID`)
    );


    CREATE TABLE `ACTIVEMQ_MSGS` (
      `ID` bigint(20) NOT NULL,
      `CONTAINER` varchar(250) NOT NULL,
      `MSGID_PROD` varchar(250) DEFAULT NULL,
      `MSGID_SEQ` bigint(20) DEFAULT NULL,
      `EXPIRATION` bigint(20) DEFAULT NULL,
      `MSG` mediumblob,
      `PRIORITY` bigint(20) DEFAULT NULL,
      `XID` varchar(250) DEFAULT NULL,
      PRIMARY KEY (`ID`),
      KEY `ACTIVEMQ_MSGS_MIDX` (`MSGID_PROD`,`MSGID_SEQ`),
      KEY `ACTIVEMQ_MSGS_CIDX` (`CONTAINER`),
      KEY `ACTIVEMQ_MSGS_EIDX` (`EXPIRATION`),
      KEY `ACTIVEMQ_MSGS_PIDX` (`PRIORITY`),
      KEY `ACTIVEMQ_MSGS_XIDX` (`XID`)
    );



    commit; 
  replicas: 1
```
