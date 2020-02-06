package com.tremolosecurity.unison.k8s.tasks;

import java.util.Map;

import com.tremolosecurity.provisioning.core.ProvisioningException;
import com.tremolosecurity.provisioning.core.User;
import com.tremolosecurity.provisioning.core.Workflow;
import com.tremolosecurity.provisioning.core.WorkflowTask;
import com.tremolosecurity.provisioning.core.ProvisioningUtil.ActionType;
import com.tremolosecurity.provisioning.util.CustomTask;
import com.tremolosecurity.saml.Attribute;
import com.tremolosecurity.server.GlobalEntries;
import com.tremolosecurity.unison.k8s.targets.GitLabUserStoreProvider;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;

import org.apache.commons.codec.binary.Base64;
import org.bouncycastle.util.io.pem.PemWriter;
import org.gitlab4j.api.GitLabApi;
import org.gitlab4j.api.models.Namespace;
import org.gitlab4j.api.models.Project;
import org.gitlab4j.api.models.ProjectHook;
import org.gitlab4j.api.models.Visibility;

/**
 * CreateGitLabProject
 */
public class CreateGitLabProject implements CustomTask {

    transient WorkflowTask task;
    String targetName;
    String orgName;

    @Override
    public boolean doTask(User user, Map<String, Object> request) throws ProvisioningException {
        int approvalID = 0;
		
		
		
		if (request.containsKey("APPROVAL_ID")) {
			approvalID = (Integer) request.get("APPROVAL_ID");
		}
		
        Workflow workflow = task.getWorkflow();
        
        GitLabUserStoreProvider gitlab = (GitLabUserStoreProvider) task.getConfigManager().getProvisioningEngine().getTarget(this.targetName).getProvider();
        GitLabApi gitLabApi = new GitLabApi(gitlab.getUrl(), gitlab.getToken());

        try {
            //create project
            Project projectSpec = new Project().withNamespace(gitLabApi.getNamespaceApi().findNamespaces(orgName).get(0))
                .withName((String)request.get("projectName"))
                .withDescription("description")
                .withIssuesEnabled(true)
                .withMergeRequestsEnabled(true)
                .withWikiEnabled(true)
                .withSnippetsEnabled(true)
                .withVisibilityLevel(Visibility.INTERNAL.ordinal())
                .withSnippetsEnabled(true);

            Project newProject = gitLabApi.getProjectApi().createProject(projectSpec);

            GlobalEntries.getGlobalEntries().getConfigManager().getProvisioningEngine().logAction(gitlab.getName(),false, ActionType.Add, approvalID, workflow, "gitlab-project-" + newProject.getNameWithNamespace() + "-name", newProject.getNameWithNamespace());

            //generate deployment key
            KeyPairGenerator generator;
            generator = KeyPairGenerator.getInstance("RSA");
            // or: generator = KeyPairGenerator.getInstance("DSA");
            generator.initialize(2048);
            KeyPair keyPair = generator.genKeyPair();
            String sshPubKey = "ssh-rsa " + Base64.encodeBase64String( encodePublicKey((RSAPublicKey) keyPair.getPublic())) + " openunison-deploy-key";

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            org.bouncycastle.openssl.PEMWriter genPrivKey = new org.bouncycastle.openssl.PEMWriter(new OutputStreamWriter(baos));
            genPrivKey.writeObject(keyPair.getPrivate());
            genPrivKey.close();

            String pem = new String(baos.toByteArray());

            gitLabApi.getDeployKeysApi().addDeployKey(newProject, "openunison-deploy-key", sshPubKey, false);

            GlobalEntries.getGlobalEntries().getConfigManager().getProvisioningEngine().logAction(gitlab.getName(),false, ActionType.Add, approvalID, workflow, "gitlab-project-" + newProject.getNameWithNamespace() + "-deploykey", "openunison-deploy-key");

            request.put("gitSshUrl", newProject.getSshUrlToRepo());
            request.put("gitPrivateKey",pem);
            request.put("newProjectJSON",newProject.toString());



        } catch (Exception e) {
            throw new ProvisioningException("Could not create gitlab project",e);
        }

        return true;
    }

    @Override
    public void init(WorkflowTask task, Map<String, Attribute> config) throws ProvisioningException {
        this.task = task;
        this.targetName = config.get("target").getValues().get(0);
        this.orgName = config.get("orgName").getValues().get(0);

        

    }

    @Override
    public void reInit(WorkflowTask task) throws ProvisioningException {
        this.task = task;

    }

     byte[] encodePublicKey(RSAPublicKey key) throws IOException
   {
       ByteArrayOutputStream out = new ByteArrayOutputStream();
       /* encode the "ssh-rsa" string */
       byte[] sshrsa = new byte[] {0, 0, 0, 7, 's', 's', 'h', '-', 'r', 's', 'a'};
       out.write(sshrsa);
       /* Encode the public exponent */
       BigInteger e = key.getPublicExponent();
       byte[] data = e.toByteArray();
       encodeUInt32(data.length, out);
       out.write(data);
       /* Encode the modulus */
       BigInteger m = key.getModulus();
       data = m.toByteArray();
       encodeUInt32(data.length, out);
       out.write(data);
       return out.toByteArray();
   }

    void encodeUInt32(int value, OutputStream out) throws IOException
   {
       byte[] tmp = new byte[4];
       tmp[0] = (byte)((value >>> 24) & 0xff);
       tmp[1] = (byte)((value >>> 16) & 0xff);
       tmp[2] = (byte)((value >>> 8) & 0xff);
       tmp[3] = (byte)(value & 0xff);
       out.write(tmp);
   }

    
}