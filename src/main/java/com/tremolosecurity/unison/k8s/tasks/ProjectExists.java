package com.tremolosecurity.unison.k8s.tasks;

import java.io.IOException;
import java.util.Map;

import com.tremolosecurity.provisioning.core.ProvisioningException;
import com.tremolosecurity.provisioning.core.User;
import com.tremolosecurity.provisioning.core.WorkflowTask;
import com.tremolosecurity.provisioning.util.CustomTask;
import com.tremolosecurity.provisioning.util.HttpCon;
import com.tremolosecurity.saml.Attribute;
import com.tremolosecurity.server.GlobalEntries;
import com.tremolosecurity.unison.openshiftv3.OpenShiftTarget;

/**
 * ProjectExists
 */
public class ProjectExists implements CustomTask {
    String targetName;

    @Override
    public boolean doTask(User user, Map<String, Object> request) throws ProvisioningException {

        OpenShiftTarget target = (OpenShiftTarget) GlobalEntries.getGlobalEntries().getConfigManager().getProvisioningEngine().getTarget(this.targetName).getProvider();
        String projectName = (String) request.get("projectName");

        HttpCon con = null;

        try {
            con = target.createClient();

            if (target.isObjectExistsByName(target.getAuthToken(), con, "/api/v1/namespaces", projectName)) {
                user.getAttribs().put("sandboxExists", new Attribute("sandboxExists","true"));
            } else {
                user.getAttribs().put("sandboxExists", new Attribute("sandboxExists","false"));
            }

            
        } catch (Exception e) {
            throw new ProvisioningException("Could not check if proejct exists",e);
        } finally {
            if (con != null) {
                try {
                    con.getHttp().close();
                } catch (IOException e) {
                    
				}
                con.getBcm().close();
            }
        }
        

        return true;
    }

    @Override
    public void init(WorkflowTask task, Map<String, Attribute> config) throws ProvisioningException {
        this.targetName = config.get("targetName").getValues().get(0);
	}

	@Override
	public void reInit(WorkflowTask task) throws ProvisioningException {
		
	}

    
}