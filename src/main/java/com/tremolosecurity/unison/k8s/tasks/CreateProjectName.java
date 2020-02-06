package com.tremolosecurity.unison.k8s.tasks;

import java.util.Map;

import com.tremolosecurity.provisioning.core.ProvisioningException;
import com.tremolosecurity.provisioning.core.User;
import com.tremolosecurity.provisioning.core.WorkflowTask;
import com.tremolosecurity.provisioning.util.CustomTask;
import com.tremolosecurity.saml.Attribute;

public class CreateProjectName implements CustomTask {

    @Override
    public boolean doTask(User user, Map<String, Object> request) throws ProvisioningException {
        String emailAddress = user.getAttribs().get("mail").getValues().get(0);

        String projectName = "sandbox-" + emailAddress.replaceAll("[.@_]","-");

        request.put("projectName", projectName);

        return true;
    }

    @Override
    public void init(WorkflowTask task, Map<String, Attribute> config) throws ProvisioningException {

	}

	@Override
	public void reInit(WorkflowTask task) throws ProvisioningException {
		
	}

}