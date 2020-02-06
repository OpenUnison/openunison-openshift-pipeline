package com.tremolosecurity.unison.k8s.tasks;

import java.io.UnsupportedEncodingException;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tremolosecurity.provisioning.core.ProvisioningException;
import com.tremolosecurity.provisioning.core.User;
import com.tremolosecurity.provisioning.core.Workflow;
import com.tremolosecurity.provisioning.core.WorkflowTask;
import com.tremolosecurity.provisioning.core.ProvisioningUtil.ActionType;
import com.tremolosecurity.provisioning.util.CustomTask;
import com.tremolosecurity.saml.Attribute;
import com.tremolosecurity.server.GlobalEntries;
import com.tremolosecurity.unison.k8s.targets.GitLabUserStoreProvider;
import com.tremolosecurity.unison.openshiftv3.OpenShiftTarget;

import org.apache.commons.codec.digest.DigestUtils;
import org.gitlab4j.api.GitLabApi;
import org.gitlab4j.api.models.Project;
import org.gitlab4j.api.models.ProjectHook;

/**
 * NewAppTasks
 */
public class NewAppTasks implements CustomTask {
    String target;
    String apiserverhost;
    String gitlabTarget;

    transient WorkflowTask task;

    @Override
    public boolean doTask(User user, Map<String, Object> request) throws ProvisioningException {
        String projectName = (String) request.get("projectName");
        String sshKey = ((String) request.get("gitPrivateKey"));

        if (! sshKey.endsWith("\n")) {
            sshKey += "\n";
        }

        try {
            String base64PrivKey = Base64.getEncoder().encodeToString(sshKey.getBytes("UTF-8"));
            request.put("base64SshPrivateKey", base64PrivKey);
        } catch (UnsupportedEncodingException e) {
            throw new ProvisioningException("Could get key",e);
        }
        
        String gitUrl = (String) request.get("gitSshUrl");
        String prefix = gitUrl.substring(0,gitUrl.indexOf("@") + 1);
        String suffix = gitUrl.substring(gitUrl.indexOf(":"));
        String newGitUrl = new StringBuilder().append(prefix).append("gitlab-gitlab-shell.gitlab.svc.cluster.local").append(suffix).toString();

        request.put("gitSshInternalURL",newGitUrl);

        String secretData = DigestUtils.sha256Hex(UUID.randomUUID().toString());

        request.put("webHookSecretData",secretData);
       

        OpenShiftTarget oc = (OpenShiftTarget) GlobalEntries.getGlobalEntries().getConfigManager().getProvisioningEngine().getTarget(this.target).getProvider();
        String url = "https://" + this.apiserverhost + "/apis/build.openshift.io/v1/namespaces/jenkins/buildconfigs/" + projectName + "-pipeline/webhooks/" + secretData + "/gitlab";
        try {
            //request.put("weebhookURL", new String(Base64.getEncoder().encode(url.getBytes("UTF-8"))));

            GitLabUserStoreProvider gitlab = (GitLabUserStoreProvider) GlobalEntries.getGlobalEntries().getConfigManager().getProvisioningEngine().getTarget(this.gitlabTarget).getProvider();
            GitLabApi gitLabApi = new GitLabApi(gitlab.getUrl(), gitlab.getToken());
            ProjectHook hook = new ProjectHook().withPushEvents(true).withPushEventsBranchFilter("master");
            
            ObjectMapper mapper = new ObjectMapper();
            Project newProject = (Project) mapper.readValue((String) request.get("newProjectJSON"), Project.class);

            gitLabApi.getProjectApi().addHook(newProject, url, hook, false, "");

            int approvalID = 0;
		
		
		
            if (request.containsKey("APPROVAL_ID")) {
                approvalID = (Integer) request.get("APPROVAL_ID");
            }
            
            Workflow workflow = task.getWorkflow();


            GlobalEntries.getGlobalEntries().getConfigManager().getProvisioningEngine().logAction(gitlab.getName(),false, ActionType.Add, approvalID, workflow, "gitlab-project-" + newProject.getNameWithNamespace() + "-webhook", "master");

            } catch (Exception e) {
                throw new ProvisioningException("couldnt provision webhook",e);
            }
        return true;
    }

    @Override
    public void init(WorkflowTask task, Map<String, Attribute> config) throws ProvisioningException {
        this.target = config.get("target").getValues().get(0);
        this.apiserverhost = config.get("apiserverhost").getValues().get(0);
        this.gitlabTarget = config.get("gitlabTarget").getValues().get(0);
        this.task = task;
	}

	@Override
	public void reInit(WorkflowTask task) throws ProvisioningException {
		this.task = task;
	}

    
}