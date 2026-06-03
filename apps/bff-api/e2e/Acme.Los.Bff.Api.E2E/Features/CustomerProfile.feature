Feature: Customer profile API

  Scenario: Trusted customer identity can read a default profile
    Given I am a trusted BFF caller for user "user-123" with email "user@example.com"
    When I request the customer profile
    Then the response status code should be OK
    And the customer profile email should be "user@example.com"

  Scenario: Missing trusted identity cannot read a customer profile
    When I request the customer profile
    Then the response status code should be Unauthorized

  Scenario: Trusted customer identity can update a profile with CSRF without changing Okta email
    Given I am a trusted BFF caller for user "user-123" with email "user@example.com"
    And I have a BFF CSRF token
    When I update the customer profile email to "updated@example.com"
    Then the response status code should be OK
    And the customer profile email should be "user@example.com"

  Scenario: Trusted customer identity cannot update a profile without CSRF
    Given I am a trusted BFF caller for user "user-123" with email "user@example.com"
    When I update the customer profile without a CSRF token
    Then the response status code should be BadRequest
